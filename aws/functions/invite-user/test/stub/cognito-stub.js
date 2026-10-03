// Stand-in for the Cognito SDK: records calls, users live in globalThis.POOL.
export class AdminCreateUserCommand { constructor(i) { this.name = 'create'; this.input = i; } }
export class AdminGetUserCommand { constructor(i) { this.name = 'get'; this.input = i; } }
export class AdminSetUserMFAPreferenceCommand { constructor(i) { this.name = 'mfapref'; this.input = i; } }
export class AdminUserGlobalSignOutCommand { constructor(i) { this.name = 'signout'; this.input = i; } }
export class CognitoIdentityProviderClient {
  async send(cmd) {
    globalThis.CALLS.push([cmd.name, cmd.input]);
    const u = globalThis.POOL[cmd.input.Username];
    if (cmd.name === 'get') { if (!u) { const e = new Error('nf'); e.name = 'UserNotFoundException'; throw e; } return { UserStatus: u }; }
    if (cmd.name === 'mfapref' || cmd.name === 'signout') { if (!u) { const e = new Error('nf'); e.name = 'UserNotFoundException'; throw e; } return {}; }
    if (cmd.input.MessageAction === 'RESEND') return {};
    if (u) { const e = new Error('exists'); e.name = 'UsernameExistsException'; throw e; }
    globalThis.POOL[cmd.input.Username] = 'FORCE_CHANGE_PASSWORD'; return {};
  }
}
