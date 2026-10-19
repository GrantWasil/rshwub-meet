"use client";
import { Alert, AlertDescription, AlertTitle } from "@rallly/ui/alert";
import { InfoIcon } from "lucide-react";

import { LoginLink } from "@/components/login-link";
import { RegisterLink } from "@/components/register-link";
import { usePoll } from "@/features/poll/client";
import { PollManagementLink } from "@/features/poll/management/components/poll-management-link";
import { useUser } from "@/features/user/client";
import { Trans } from "@/i18n/client";

export const GuestPollAlert = () => {
  const { user } = useUser();
  const poll = usePoll();

  if (user?.isGuest === false) {
    return null;
  }
  return (
    <div className="space-y-3">
      <PollManagementLink pollId={poll.id} />
      <Alert>
        <InfoIcon />
        <AlertTitle>
          <Trans
            i18nKey="optionalOrganizerAccount"
            defaults="An account is optional"
          />
        </AlertTitle>
        <AlertDescription>
          <p className="text-sm">
            <Trans
              i18nKey="guestPollAlertDescription"
              defaults="<0>Create an account</0> or <1>login</1> to claim this poll."
              components={[
                <RegisterLink
                  className="underline hover:text-foreground"
                  key="register"
                />,
                <LoginLink
                  className="underline hover:text-foreground"
                  key="login"
                />,
              ]}
            />
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
};
