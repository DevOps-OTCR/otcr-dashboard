import { redirect } from 'next/navigation';

export default function SignUpPage() {
  // Redirect to sign-in since we only use Azure MSAL
  redirect('/sign-in');
}
