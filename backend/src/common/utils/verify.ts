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

export async function getVerifiedUser(accessToken: string) {
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
    return data.userPrincipalName;
  } catch (error: any) {
    console.error('Auth Error:', error.response?.data || error.message);
    throw new Error('Unauthorized: Invalid or Expired Token');
  }
}