import * as z from "zod"

export const graphApiExpectedResponseSchema = z.object({
  userPrincipalName: z
    .string()
    .min(1)
    .refine((val) => val.endsWith("@illinois.edu"), {
      message: "userPrincipalName must have domain @illinois.edu",
    }),
  givenName: z.string().min(1),
  surname: z.string().min(1),
  mail: z.string().min(1),
});
// Using your Dev Client ID and UIUC Tenant ID
const TENANT_ID = '44467e6f-462c-4ea2-823f-7800de5434e3';

/**
 * Validates the token by calling Microsoft Graph.
 * Since we have < 100 users, the latency of this network call 
 * is negligible compared to the ease of implementation.
 */
async function getVerifiedUser(accessToken: string) {
    const url =
    "https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,givenName,surname,mail";
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // The 'mail' field is the primary email, 'userPrincipalName' is the NetID email
    const data = await graphApiExpectedResponseSchema.parseAsync(
      await response.json(),
    );
    console.log(data);
  } catch (error: any) {
    console.error('Auth Error:', error.response?.data || error.message);
    throw new Error('Unauthorized: Invalid or Expired Token');
  }
}

const accessToken = "eyJ0eXAiOiJKV1QiLCJub25jZSI6IkxScFNCTkRZeURZdTktTGhwLTNsNXhIeGd2NEZGS3dFamYwVkRKNEYwMDQiLCJhbGciOiJSUzI1NiIsIng1dCI6InNNMV95QXhWOEdWNHlOLUI2ajJ4em1pazVBbyIsImtpZCI6InNNMV95QXhWOEdWNHlOLUI2ajJ4em1pazVBbyJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTAwMDAtYzAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC80NDQ2N2U2Zi00NjJjLTRlYTItODIzZi03ODAwZGU1NDM0ZTMvIiwiaWF0IjoxNzcxMjk4NDIyLCJuYmYiOjE3NzEyOTg0MjIsImV4cCI6MTc3MTMwMjM4MSwiYWNjdCI6MCwiYWNyIjoiMSIsImFpbyI6IkFVUUF1LzhiQUFBQWJTcGpITHpDMDdpQXNuQ1hCY2U3aVorM3Z4QWRrTDJJTGRtNHZFUWxSOGdZL1ZoZit0MWU1NVh4cExsWlR4SEZUdHRRTXVpQ0Fza1ZVdFp4TU9jNG9RPT0iLCJhbXIiOlsicHdkIiwicnNhIl0sImFwcF9kaXNwbGF5bmFtZSI6Ik9UQ1IiLCJhcHBpZCI6IjI5NGJjYWU0LWQ1YzMtNDRlMi05ZTA2LTA2Y2MyMzBhOWJmZCIsImFwcGlkYWNyIjoiMCIsImRldmljZWlkIjoiNDBjY2UzZGUtMDdiNy00YWZjLTllM2QtNjA5Y2MzYzhhZjg1IiwiZmFtaWx5X25hbWUiOiJQYXRlbCIsImdpdmVuX25hbWUiOiJNZWdoIiwiaWR0eXAiOiJ1c2VyIiwiaXBhZGRyIjoiMTMwLjEyNi4yNTUuMjQ3IiwibmFtZSI6IlBhdGVsLCBNZWdoIiwib2lkIjoiNWI2Y2Y5MzktNzZiMy00NDVlLWIyNTUtZWJiYWQxMWMxNTdlIiwib25wcmVtX3NpZCI6IlMtMS01LTIxLTI1MDk2NDEzNDQtMTA1MjU2NTkxNC0zMjYwODI0NDg4LTQzMDU4MDIiLCJwbGF0ZiI6IjMiLCJwdWlkIjoiMTAwMzIwMDQ0NDFBNEM0MyIsInJoIjoiMS5BUndBYjM1R1JDeEdvazZDUDNnQTNsUTA0d01BQUFBQUFBQUF3QUFBQUFBQUFBQWNBQ1VjQUEuIiwic2NwIjoiZW1haWwgb3BlbmlkIHByb2ZpbGUgVXNlci5SZWFkIiwic2lkIjoiMDAxMzhmZWEtN2VjZS0yOTQ3LTc3NjgtNjMxNGZmZTRmNTY3Iiwic2lnbmluX3N0YXRlIjpbImR2Y19tbmdkIiwiZHZjX2NtcCIsImlua25vd25udHdrIiwia21zaSJdLCJzdWIiOiJBaXlITm5CWlhYMi1OWmZYMzMxcmRIVUJveGNUYWNZRkZyM0pYWnNoMGtFIiwidGVuYW50X3JlZ2lvbl9zY29wZSI6Ik5BIiwidGlkIjoiNDQ0NjdlNmYtNDYyYy00ZWEyLTgyM2YtNzgwMGRlNTQzNGUzIiwidW5pcXVlX25hbWUiOiJtcGF0ZTQ0OUBpbGxpbm9pcy5lZHUiLCJ1cG4iOiJtcGF0ZTQ0OUBpbGxpbm9pcy5lZHUiLCJ1dGkiOiI3cnFTRVgyblZrZWw2MUdHdndnQkFBIiwidmVyIjoiMS4wIiwid2lkcyI6WyJiNzlmYmY0ZC0zZWY5LTQ2ODktODE0My03NmIxOTRlODU1MDkiXSwieG1zX2FjZCI6MTc3MTAyOTMzNSwieG1zX2FjdF9mY3QiOiIzIDkiLCJ4bXNfZnRkIjoiellaLVdkMEdmUU55QUlvdTU4UVRad3ljV0F1R3FPWXdfakdZY1NvZm0xRUJkWE56YjNWMGFDMWtjMjF6IiwieG1zX2lkcmVsIjoiMSAxMiIsInhtc19zdCI6eyJzdWIiOiIxS0tqQUNNV2ZYa042czltbzlGbzZSQ2J5ZlMtT2YzdkxITEVraWxPN2NZIn0sInhtc19zdWJfZmN0IjoiMyAxMCIsInhtc190Y2R0IjoxNDI2NzgwNDM1LCJ4bXNfdG50X2ZjdCI6IjEyIDMifQ.N5IKW6P-mgmWJRio-YGZoa50_mUE6iiSRkEdeO33Y0oTCJ9yFq5JcgpQCJhbsj7E4UGzlkPXHFl1wf7-1ILxFozTCTOnFqCpNAieRsSO_G_UPbSnGNBl3NCL9b6uVdKUWS9_aXdCSYz1c2qLyPck367e4hRBRZt5zOYR3H_IEpcL1jklwe-Nv4IQ66JE3odayxV4PSpdy_kF1J8g_X66R3wqrn73nETwKLDH-sI5OL1WafP01i67y7IVMn3-C67TpTXoccVlgNjwhgIt90Tk_0PwG3ZNea65WvQpYvon5LitsIJf-wWZnwZ0vYq7jo1aZ5-6QVkx6cYh2OcKV5DxvA";
getVerifiedUser(accessToken);