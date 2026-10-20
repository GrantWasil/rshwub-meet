#!/usr/bin/env python3
"""Disposable full-image smoke test; random dummy secrets, empty DB, no external network."""
import argparse, base64, datetime, http.cookies, json, os, pathlib, re, secrets, subprocess, sys, time, traceback
from email.message import Message
ROOT = pathlib.Path.home() / '.local/share/rshwub-meet-deploy'
PG = 'postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873'

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--image', required=True)
    p.add_argument('--revision', required=True)
    a = p.parse_args()
    if not re.fullmatch('ghcr.io/grantwasil/rshwub-meet@sha256:[a-f0-9]{64}', a.image) or not re.fullmatch('[a-f0-9]{40}', a.revision):
        raise RuntimeError('Invalid release identifiers')
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    prefix = 'rshwub-image-check-' + secrets.token_hex(5)
    network = prefix
    db = prefix + '-db'
    web = prefix + '-web'
    volume = None
    network_id = db_id = web_id = None
    result = None
    logpath = ROOT / ('image-smoke-' + a.revision + '.log')
    fd = os.open(logpath, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as log:

        def run(args, **kwargs):
            return subprocess.run(args, check=True, stdout=log, stderr=log, **kwargs)

        def create(args, **kwargs):
            resource_id = subprocess.check_output(args, text=True, stderr=log, **kwargs).strip()
            if not re.fullmatch(r'[a-f0-9]{64}', resource_id):
                raise RuntimeError('Unexpected created resource identifier')
            return resource_id

        def inspect(name):
            return json.loads(subprocess.check_output(['docker', 'inspect', name], text=True, stderr=log))[0]
        try:
            run(['docker', 'pull', '--platform', 'linux/amd64', a.image])
            image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', a.image], text=True, stderr=log))[0]
            assert image['Config']['Labels']['org.opencontainers.image.revision'] == a.revision
            assert image['Architecture'] == 'amd64'
            network_id = create(['docker', 'network', 'create', '--internal', '--label', 'rshwub-meet.image-check=true', network])
            dbpw = secrets.token_hex(32)
            denv = os.environ.copy()
            denv.update({'POSTGRES_PASSWORD': dbpw, 'POSTGRES_USER': 'smoke', 'POSTGRES_DB': 'smoke'})
            db_id = create(['docker', 'create', '--name', db, '--network', network, '--network-alias', 'db', '--memory', '512m', '--cpus', '0.5', '--mount', 'type=volume,destination=/var/lib/postgresql', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER', '--env', 'POSTGRES_DB', '--label', 'rshwub-meet.image-check=true', PG], env=denv)
            run(['docker', 'start', db_id])
            dbstate = inspect(db_id)
            volume = dbstate['Mounts'][0]['Name']
            assert not dbstate['HostConfig']['PortBindings']
            for _ in range(60):
                if subprocess.run(['docker', 'exec', db, 'pg_isready', '-U', 'smoke', '-d', 'smoke'], stdout=log, stderr=log).returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Disposable database did not become ready')
            env = {'NODE_ENV': 'production', 'NEXT_PUBLIC_BASE_URL': 'https://meet.rshwub.com', 'NEXT_PUBLIC_SELF_HOSTED': 'true', 'DATABASE_URL': f'postgresql://smoke:{dbpw}@db:5432/smoke', 'SECRET_PASSWORD': secrets.token_hex(48), 'APP_NAME': 'Rshwub Meet', 'SUPPORT_EMAIL': 'support@example.invalid', 'NOREPLY_EMAIL': 'noreply@example.invalid', 'INITIAL_ADMIN_EMAIL': 'owner@example.invalid', 'EMAIL_PROVIDER': 'smtp', 'SMTP_HOST': 'smtp.invalid', 'SMTP_PORT': '2465', 'SMTP_SECURE': 'true', 'SMTP_USER': 'unused', 'SMTP_PWD': secrets.token_hex(16), 'EMAIL_LOGIN_ENABLED': 'true', 'REGISTRATION_ENABLED': 'true', 'RATE_LIMIT_ENABLED': 'true', 'TRUST_PROXY_X_REAL_IP': 'false', 'MAINTENANCE_MODE': 'false', 'API_BASE_URL': 'http://127.0.0.1:1', 'NEXT_TELEMETRY_DISABLED': '1', 'NODE_OPTIONS': '--max-old-space-size=768'}
            wenv = os.environ.copy()
            wenv.update(env)
            argv = ['docker', 'create', '--platform', 'linux/amd64', '--name', web, '--network', network, '--memory', '1g', '--cpus', '1', '--label', 'rshwub-meet.image-check=true']
            for key in env:
                argv.extend(['--env', key])
            argv.append(a.image)
            web_id = create(argv, env=wenv)
            run(['docker', 'start', web_id])
            state = inspect(web_id)
            assert not state['HostConfig']['PortBindings'], 'Unexpected published ports'
            base = 'http://127.0.0.1:3000'

            # Probe the built Next.js process from its own loopback; no ports or
            # external network are needed. Cookie/challenge values stay in memory.
            def request(path, method='GET', body=None, origin='https://meet.rshwub.com', cookie=None):
                headers = {'Host': 'meet.rshwub.com', 'Origin': origin, 'User-Agent': 'Rshwub-Image-Smoke/1.0', 'Accept': 'application/json'}
                if cookie:
                    headers['Cookie'] = cookie
                if body is not None:
                    headers['Content-Type'] = 'application/json'
                js = "let chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);let p=JSON.parse(Buffer.concat(chunks));let r=await fetch(p.url,{method:p.method,headers:p.headers,body:p.body,redirect:'manual',signal:AbortSignal.timeout(15000)});let h=[...r.headers].filter(([k])=>k!=='set-cookie');h.push(...r.headers.getSetCookie().map(v=>['set-cookie',v]));process.stdout.write(JSON.stringify({status:r.status,headers:h,body:Buffer.from(await r.arrayBuffer()).toString('base64')}));"
                payload = {'url': base + path, 'method': method, 'headers': headers}
                if body is not None:
                    payload['body'] = json.dumps(body)
                result = subprocess.run(['docker', 'exec', '-i', web, 'node', '--input-type=module', '-e', js], input=json.dumps(payload), text=True, stdout=subprocess.PIPE, stderr=log)
                if result.returncode:
                    raise OSError('Container loopback request failed')
                response = json.loads(result.stdout)
                h = Message()
                for (k, v) in response['headers']:
                    h[k] = v
                return (response['status'], h, base64.b64decode(response['body']))
            health = None
            deadline = time.monotonic() + 300
            while time.monotonic() < deadline:
                try:
                    (status, headers, body) = request('/api/status')
                    health = json.loads(body)
                    if status == 200 and health.get('database') == 'connected':
                        break
                except (OSError, ValueError):
                    pass
                if not inspect(web)['State']['Running']:
                    raise RuntimeError('Disposable app exited before healthy')
                time.sleep(3)
            else:
                raise RuntimeError('Disposable app did not become healthy')
            assert a.revision in health['version']
            (status, headers, body) = request('/api/better-auth/get-session')
            assert status == 200 and json.loads(body) is None, 'Ordinary auth response wrapper regression'
            (status, headers, body) = request('/api/better-auth/passkey/generate-authenticate-options')
            options = json.loads(body)
            assert status == 200 and options.get('rpId') == 'meet.rshwub.com' and (options.get('userVerification') == 'required'), 'Passkey options response regression'
            assert 'headers' not in options and 'response' not in options
            assert isinstance(options.get('challenge'), str) and options['challenge'], 'Missing challenge'
            assert 'no-store' in headers.get('Cache-Control', ''), 'Missing no-store'
            cookiejar = http.cookies.SimpleCookie()
            for value in headers.get_all('Set-Cookie', []):
                cookiejar.load(value)
            challenge_cookie = '; '.join((k + '=' + v.value for (k, v) in cookiejar.items()))
            assert challenge_cookie
            optionscache = headers.get('Cache-Control')
            (status, headers, body) = request('/api/better-auth/passkey/verify-authentication', 'POST', {'response': {}}, origin='https://untrusted.example', cookie=challenge_cookie)
            assert status == 403 and json.loads(body).get('code') == 'INVALID_ORIGIN', 'Foreign origin not rejected'
            (status, headers, body) = request('/api/better-auth/passkey/generate-register-options')
            assert status == 403 and json.loads(body).get('code') == 'PASSKEY_ACCOUNT_REQUIRED'
            (status, headers, body) = request('/login')
            html = body.decode()
            assert status == 200 and 'Sign in with a passkey' in html and ('<html' in html)
            q = "SELECT json_build_object('tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),'users',(SELECT count(*) FROM users),'passkeys',(SELECT count(*) FROM passkeys),'migrations',(SELECT count(*) FROM _prisma_migrations),'unfinishedMigrations',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL))"
            state = json.loads(subprocess.check_output(['docker', 'exec', '-i', db, 'psql', '-U', 'smoke', '-d', 'smoke', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], input=q, text=True, stderr=log))
            assert state['users'] == 0 and state['passkeys'] == 0 and (state['unfinishedMigrations'] == 0)
            result = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'image': a.image, 'revision': a.revision, 'fullImageSmoke': 'passed', 'database': state, 'getSessionIsNull': True, 'optionsTopLevel': True, 'rpId': options['rpId'], 'userVerification': options['userVerification'], 'cacheControl': optionscache, 'untrustedOriginStatus': 403, 'anonymousRegistrationStatus': 403, 'loginRendered': True, 'realCredentialsUsed': False, 'networkInternal': True, 'loopbackOnly': True, 'publishedPorts': False}
        finally:
            if web_id:
                subprocess.run(['docker', 'logs', web_id], stdout=log, stderr=log)
            for resource_id in [web_id, db_id]:
                if resource_id:
                    subprocess.run(['docker', 'rm', '--force', '--volumes', resource_id], stdout=log, stderr=log)
            if network_id:
                subprocess.run(['docker', 'network', 'rm', network_id], stdout=log, stderr=log)
            owned = [('container', web_id), ('container', db_id), ('network', network_id), ('volume', volume)]
            for kind, resource_id in owned:
                if resource_id and subprocess.run(['docker', kind, 'inspect', resource_id], stdout=subprocess.DEVNULL, stderr=log).returncode == 0:
                    raise RuntimeError('Disposable resource cleanup failed: ' + kind)
    result['cleanupPassed'] = True
    evidence = ROOT / ('image-smoke-' + a.revision + '.json')
    evidence.write_text(json.dumps(result, indent=2) + '\n')
    evidence.chmod(0o600)
    print(json.dumps(result), flush=True)
    print('Disposable app, database, network and volume removed.', flush=True)
if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        line = traceback.extract_tb(e.__traceback__)[-1].lineno
        detail = str(e) if isinstance(e, (RuntimeError, AssertionError)) else 'inspect protected log without exposing secrets'
        print(f'Image smoke test failed at line {line}: {detail or type(e).__name__}', file=sys.stderr)
        sys.exit(1)
