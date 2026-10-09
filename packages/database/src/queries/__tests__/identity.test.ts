// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase } from './fake-supabase';
import { getOrCreateUserFromFirebase, getUserByEmail, getUserByFirebaseUid, findVerifiedPhoneOwner } from '../users';
import { reconcileMsIdentity } from '../ms-identity';
import { recordIdentity, findUserIdByIdentity } from '../identity';

const UNIQUE = {
  users: [['firebase_uid'], ['ms_oid'], ['email'], ['phone']],
  user_identities: [['provider', 'provider_uid']],
};

function world(users: any[] = [], identities: any[] = []) {
  return createFakeSupabase({ users, user_identities: identities }, UNIQUE);
}

const googleRow = {
  id: 'u-google',
  name: 'Priya',
  email: 'priya@gmail.com',
  phone: '+919876543210',
  firebase_uid: 'fb-google',
  ms_oid: null,
  avatar_url: 'x',
};

describe('getOrCreateUserFromFirebase', () => {
  it('Google then phone OTP: one person, two identities, primary uid untouched', async () => {
    const { client, tables } = world([{ ...googleRow }]);

    const phoneSignIn = await getOrCreateUserFromFirebase(
      { uid: 'fb-phone', phoneNumber: '+919876543210', email: null },
      client,
    );
    expect(phoneSignIn).toMatchObject({ isNewUser: false, user: { id: 'u-google' } });
    expect(tables.users).toHaveLength(1);
    expect(tables.users[0].firebase_uid).toBe('fb-google');
    expect(tables.user_identities.map((i) => i.provider_uid).sort()).toEqual(['fb-phone']);

    // The old code flipped users.firebase_uid back and forth here.
    const googleAgain = await getOrCreateUserFromFirebase({ uid: 'fb-google', email: 'priya@gmail.com' }, client);
    const phoneAgain = await getOrCreateUserFromFirebase({ uid: 'fb-phone', phoneNumber: '+919876543210' }, client);
    expect(googleAgain.user.id).toBe('u-google');
    expect(phoneAgain.user.id).toBe('u-google');
    expect(tables.users[0].firebase_uid).toBe('fb-google');
    expect(tables.user_identities.map((i) => i.provider_uid).sort()).toEqual(['fb-google', 'fb-phone']);
  });

  it('matches email case-insensitively instead of creating a second row', async () => {
    const { client, tables } = world([{ ...googleRow, id: 'u-org', email: 'Priya_S@neramclasses.com', firebase_uid: null, phone: null }]);
    const r = await getOrCreateUserFromFirebase({ uid: 'fb-new', email: 'priya_s@neramclasses.com' }, client);
    expect(r).toMatchObject({ isNewUser: false, user: { id: 'u-org', firebase_uid: 'fb-new' } });
    expect(tables.users).toHaveLength(1);
  });

  it('fills an empty users.firebase_uid, and only an empty one', async () => {
    const { client, tables } = world([{ ...googleRow, firebase_uid: null }]);
    await getOrCreateUserFromFirebase({ uid: 'fb-first', phoneNumber: '+919876543210' }, client);
    expect(tables.users[0].firebase_uid).toBe('fb-first');
    await getOrCreateUserFromFirebase({ uid: 'fb-second', email: 'PRIYA@gmail.com' }, client);
    expect(tables.users[0].firebase_uid).toBe('fb-first');
  });

  it('creates a lead only for a genuinely new person, and records the identity', async () => {
    const { client, tables } = world([{ ...googleRow }]);
    const r = await getOrCreateUserFromFirebase({ uid: 'fb-other', email: 'someone@else.com', displayName: 'Arun' }, client);
    expect(r.isNewUser).toBe(true);
    expect(r.user).toMatchObject({ user_type: 'lead', firebase_uid: 'fb-other', name: 'Arun' });
    expect(tables.user_identities).toContainEqual(expect.objectContaining({ user_id: r.user.id, provider_uid: 'fb-other' }));
  });

  it('keeps working when user_identities does not exist yet (deploy before migration)', async () => {
    const { client, tables } = world([{ ...googleRow }]);
    const realFrom = client.from;
    client.from = (t: string) => {
      if (t !== 'user_identities') return realFrom(t);
      const missing = { data: null, error: { code: '42P01', message: 'relation "user_identities" does not exist' } };
      const b: any = new Proxy({}, { get: (_x, p) => (p === 'then' ? (res: any) => res(missing) : p === 'maybeSingle' || p === 'single' ? async () => missing : () => b) });
      return b;
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await getOrCreateUserFromFirebase({ uid: 'fb-google', email: 'priya@gmail.com' }, client);
    expect(r.user.id).toBe('u-google');
    const phone = await getOrCreateUserFromFirebase({ uid: 'fb-phone', phoneNumber: '+919876543210' }, client);
    expect(phone.user.id).toBe('u-google');
    expect(tables.users).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('never attaches an unverified email to an existing person', async () => {
    const { client, tables } = world([{ ...googleRow, firebase_uid: 'fb-owner' }]);
    const r = await getOrCreateUserFromFirebase(
      { uid: 'fb-imposter', email: 'priya@gmail.com', emailVerified: false },
      client,
    );
    expect(r.isNewUser).toBe(true);
    expect(r.user.id).not.toBe('u-google');
    // users.email is unique: the claimed address stays off the new row until verified.
    expect(r.user.email).toBeNull();
    expect(r.user.email_verified).toBe(false);
    expect(tables.users).toHaveLength(2);
    expect(tables.users[0].firebase_uid).toBe('fb-owner');
  });

  it('marks the email verified once the token says so', async () => {
    const { client, tables } = world([{ ...googleRow, firebase_uid: 'fb-mail', email_verified: false }]);
    await getOrCreateUserFromFirebase({ uid: 'fb-mail', email: 'priya@gmail.com', emailVerified: true }, client);
    expect(tables.users[0].email_verified).toBe(true);
  });

  it('the loser of a parallel create reads the winner instead of failing', async () => {
    const { client, tables } = world([{ id: 'u-race', name: 'Arun', email: null, phone: null, firebase_uid: 'fb-race', ms_oid: null }]);
    const realFrom = client.from;
    const empty = world().client;
    let usersCalls = 0;
    // The first lookup misses (the other request has not committed yet); the insert then collides.
    client.from = (t: string) => (t === 'users' && usersCalls++ === 0 ? empty.from(t) : realFrom(t));
    const r = await getOrCreateUserFromFirebase({ uid: 'fb-race', emailVerified: false }, client);
    expect(r).toMatchObject({ isNewUser: false, user: { id: 'u-race' } });
    expect(tables.users).toHaveLength(1);
  });
});

describe('getUserByFirebaseUid', () => {
  it('resolves a secondary uid through user_identities', async () => {
    const { client } = world([{ ...googleRow }], [{ id: 'i1', user_id: 'u-google', provider: 'firebase', provider_uid: 'fb-phone' }]);
    expect((await getUserByFirebaseUid('fb-phone', client))?.id).toBe('u-google');
    expect(await getUserByFirebaseUid('nobody', client)).toBeNull();
  });
});

describe('getUserByEmail', () => {
  it('treats _ and % as literal characters, not wildcards', async () => {
    const { client } = world([{ id: 'u1', email: 'aXb@neramclasses.com' }]);
    expect(await getUserByEmail('a_b@neramclasses.com', client)).toBeNull();
    expect(await getUserByEmail('AXB@neramclasses.com', client)).toMatchObject({ id: 'u1' });
  });

  it('prefers the exact-case row while a case-variant pair still exists', async () => {
    const { client } = world([
      { id: 'lower', email: 'vaishnavi@neramclasses.com', created_at: '2026-01-01' },
      { id: 'upper', email: 'Vaishnavi@neramclasses.com', created_at: '2026-02-01' },
    ]);
    expect((await getUserByEmail('Vaishnavi@neramclasses.com', client))?.id).toBe('upper');
    expect((await getUserByEmail('VAISHNAVI@neramclasses.com', client))?.id).toBe('lower');
  });
});

describe('recordIdentity', () => {
  it('never moves an identity that belongs to someone else', async () => {
    const { client, tables } = world([], [{ id: 'i1', user_id: 'u-a', provider: 'firebase', provider_uid: 'fb-x' }]);
    expect(await recordIdentity('u-b', 'firebase', 'fb-x', {}, client)).toBe('owned_by_other');
    expect(tables.user_identities[0].user_id).toBe('u-a');
    expect(await recordIdentity('u-a', 'firebase', 'fb-x', {}, client)).toBe('touched');
    expect(await recordIdentity('u-a', 'firebase', 'fb-y', {}, client)).toBe('inserted');
    expect(await findUserIdByIdentity('firebase', 'fb-y', client)).toBe('u-a');
  });
});

describe('reconcileMsIdentity', () => {
  it('records the Microsoft identity on the row it links, keeps action strings', async () => {
    const { client, tables } = world([{ ...googleRow }]);
    const r = await reconcileMsIdentity(client, { msOid: 'oid-1', upn: 'Priya@neramclasses.com', phoneHints: ['9876543210'] });
    expect(r).toMatchObject({ action: 'linked_by_phone', linked: true, user: { id: 'u-google' } });
    expect(tables.users[0].ms_oid).toBe('oid-1');
    expect(tables.user_identities).toContainEqual(expect.objectContaining({ provider: 'microsoft', provider_uid: 'oid-1', user_id: 'u-google' }));
  });

  it('dry run writes nothing, not even an identity', async () => {
    const { client, tables } = world([{ ...googleRow }]);
    const r = await reconcileMsIdentity(client, { msOid: 'oid-1', upn: 'x@neramclasses.com', phoneHints: ['9876543210'], dryRun: true });
    expect(r).toMatchObject({ action: 'linked_by_phone', linked: false });
    expect(tables.users[0].ms_oid).toBeNull();
    expect(tables.user_identities).toHaveLength(0);
  });

  it('finds a person by a recorded secondary Microsoft identity', async () => {
    const { client } = world(
      [{ ...googleRow, ms_oid: 'oid-primary' }],
      [{ id: 'i1', user_id: 'u-google', provider: 'microsoft', provider_uid: 'oid-old' }],
    );
    const r = await reconcileMsIdentity(client, { msOid: 'oid-old', upn: 'old@neramclasses.com', allowCreate: false });
    expect(r).toMatchObject({ action: 'matched_ms_oid', user: { id: 'u-google' } });
  });
});

describe('findVerifiedPhoneOwner', () => {
  it('ignores a number someone only typed, and finds a verified owner', async () => {
    const { client } = world([
      { ...googleRow, id: 'u-typed', firebase_uid: 'fb-a', phone: '+919876543210', phone_verified: false, email: 'a@x.com' },
    ]);
    expect(await findVerifiedPhoneOwner('9876543210', 'u-me', client)).toBeNull();
    const verified = world([{ ...googleRow, id: 'u-owner', phone_verified: true }]);
    expect((await findVerifiedPhoneOwner('+919876543210', 'u-me', verified.client))?.id).toBe('u-owner');
    expect(await findVerifiedPhoneOwner('+919876543210', 'u-owner', verified.client)).toBeNull();
  });
});
