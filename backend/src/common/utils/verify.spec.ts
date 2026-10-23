import { getVerifiedEmail } from '../../auth/verified-identity';

describe('Microsoft verification boundary', () => {
  const profile = { userPrincipalName: 'PERSON@illinois.edu', givenName: 'Synthetic', surname: 'Person', mail: 'person@illinois.edu' };
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { jest.restoreAllMocks(); });

  test('uses the verified Microsoft UPN and normalizes its case', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));
    await expect(getVerifiedEmail('Bearer synthetic-token')).resolves.toBe('person@illinois.edu');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,givenName,surname,mail',
      { headers: { Authorization: 'Bearer synthetic-token' } },
    );
  });
  test.each([401, 403, 500])('rejects Microsoft HTTP %s even if the response contains profile-shaped data', async status => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(profile), { status }));
    await expect(getVerifiedEmail('Bearer synthetic-token')).rejects.toMatchObject({ status: 401 });
  });
  test.each([{ ...profile, userPrincipalName: 'person@different.example' }, { ...profile, userPrincipalName: undefined }, { error: 'invalid_token' }])('rejects an invalid or unsupported identity', async response => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    await expect(getVerifiedEmail('Bearer synthetic-token')).rejects.toMatchObject({ status: 401 });
  });
  test('verification failure cannot fall back to an email or profile', async () => {
    fetchMock.mockRejectedValue(new Error('Synthetic verification failure'));
    await expect(getVerifiedEmail('Bearer synthetic-token')).rejects.toMatchObject({ status: 401 });
    fetchMock.mockClear();
    await expect(getVerifiedEmail('Bearer person@illinois.edu')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
