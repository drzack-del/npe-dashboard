// Fake accounts for the local test stack. Test values only: they exist in a throwaway database
// on this machine and nowhere else. Every seeded account shares LOCAL_TEST_PASSWORD.
// Accounts with a totpSecret start with two-step verification already set up; get the current
// six-digit code from http://localhost:54321/__dev/totp?email=<address>.
export const LOCAL_TEST_PASSWORD = 'Local-Test-Only-2026!';

export const DEMO_USERS = [
  { id: '20000000-0000-0000-0000-000000000001', email: 'admin@demo-ortho.invalid', name: 'Dana Admin (fake)',
    role: 'admin', practice_id: 'demo-ortho', totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' },
  { id: '20000000-0000-0000-0000-000000000002', email: 'tc@demo-ortho.invalid', name: 'Taylor TC (fake)',
    role: 'tc', practice_id: 'demo-ortho', totpSecret: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU' },
  { id: '20000000-0000-0000-0000-000000000003', email: 'north-owner@demo-ortho.invalid', name: 'Nico North Owner (fake)',
    role: 'location_owner', practice_id: 'demo-ortho', location_scope: 'North', location_label: 'North Office',
    totpSecret: 'MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK' },
  { id: '20000000-0000-0000-0000-000000000004', email: 'other-admin@other-ortho.invalid', name: 'Olive Other Admin (fake)',
    role: 'admin', practice_id: 'other-ortho', totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' },
  // No authenticator yet: exercises the "Set up two-step verification" screen.
  { id: '20000000-0000-0000-0000-000000000005', email: 'new-tc@demo-ortho.invalid', name: 'Nora New TC (fake)',
    role: 'tc', practice_id: 'demo-ortho', totpSecret: null },
];
