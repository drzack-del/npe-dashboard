// Sign-in against AWS Cognito, for builds pointed at the AWS backend (VITE_AUTH_PROVIDER=cognito).
// App.jsx imports this file only in that mode, so the live Supabase build never downloads it.
//
// The pool requires a password plus an authenticator-app code for everyone, and accounts are
// invite-only: an invited person signs in with the one-time password from their invite email,
// picks their own password, then sets up their authenticator app.
import { Amplify } from 'aws-amplify';
import {
  signIn, confirmSignIn, signOut as amplifySignOut, fetchAuthSession,
  resetPassword, confirmResetPassword, updatePassword,
} from 'aws-amplify/auth';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      loginWith: { email: true },
    },
  },
});

// Current access token (refreshed automatically while the 12-hour sign-in lasts), or null.
// This is what the data layer and the AWS functions verify.
export async function accessToken() {
  try {
    return (await fetchAuthSession()).tokens?.accessToken?.toString() || null;
  } catch {
    return null;
  }
}

// { id, email } of the signed-in person, or null. The email claim comes from the pool's
// token function and is the verified address the person was invited with.
export async function currentUser() {
  try {
    const t = (await fetchAuthSession()).tokens?.accessToken;
    return t ? { id: t.payload.sub, email: t.payload.email } : null;
  } catch {
    return null;
  }
}

// Turns Cognito's next step into one of: done, new-password, totp-setup, totp-code.
async function next(result, email) {
  const step = result.nextStep?.signInStep;
  if (result.isSignedIn || step === 'DONE') return { step: 'done' };
  switch (step) {
    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
      return { step: 'new-password' };
    case 'CONTINUE_SIGN_IN_WITH_MFA_SETUP_SELECTION':
    case 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION':
      // The pool offers authenticator apps only, so pick it without asking.
      return next(await confirmSignIn({ challengeResponse: 'TOTP' }), email);
    case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP': {
      const d = result.nextStep.totpSetupDetails;
      return { step: 'totp-setup', setupUri: d.getSetupUri('CadenceIQ', email).toString(), secret: d.sharedSecret };
    }
    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      return { step: 'totp-code' };
    default:
      throw new Error(`This sign-in step is not supported yet (${step}). Please contact support.`);
  }
}

export async function startSignIn(email, password) {
  // A half-finished earlier attempt in this tab would make Cognito refuse a new one.
  await amplifySignOut().catch(() => {});
  return next(await signIn({ username: email, password }), email);
}

// The answer to the current step: a new password, or a six-digit authenticator code.
export async function answerStep(value, email) {
  return next(await confirmSignIn({ challengeResponse: value }), email);
}

export async function signOut() {
  await amplifySignOut().catch(() => {});
}

// Emails a reset code. Returns the masked address it went to.
export async function sendResetCode(email) {
  const r = await resetPassword({ username: email });
  return r.nextStep?.codeDeliveryDetails?.destination || email;
}

export async function finishReset(email, code, newPassword) {
  await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
}

export async function changePassword(oldPassword, newPassword) {
  await updatePassword({ oldPassword, newPassword });
}

// Plain-language versions of Cognito's errors.
export function friendlyError(err) {
  const name = err?.name || '';
  const msg = err?.message || '';
  if (name === 'NotAuthorizedException') {
    if (/temporary password has expired/i.test(msg)) return 'Your invite has expired. Ask your practice admin to resend it.';
    if (/cannot be reset in the current state/i.test(msg)) return 'You have not finished setting up your account yet. Sign in with the one-time password from your invite email, or ask your admin to resend it.';
    if (/invalid session/i.test(msg)) return 'This sign-in took too long. Please start again.';
    return 'Incorrect email or password.';
  }
  if (name === 'CodeMismatchException' || name === 'EnableSoftwareTokenMFAException') return 'That code did not match. Use the current six-digit code from your authenticator app.';
  if (name === 'ExpiredCodeException') return 'That code has expired. Request a new one.';
  if (name === 'InvalidPasswordException') return 'Passwords need at least 12 characters, with an uppercase letter, a lowercase letter and a number.';
  if (name === 'LimitExceededException' || name === 'TooManyRequestsException') return 'Too many attempts. Wait a few minutes and try again.';
  if (name === 'UserAlreadyAuthenticatedException') return 'You are already signed in. Reload the page.';
  if (name === 'NetworkError' || /network/i.test(msg)) return 'Could not reach the sign-in service. Check your connection and try again.';
  return msg || 'Something went wrong. Please try again.';
}
