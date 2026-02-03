import { redirect } from 'next/navigation';

export default function SignUpPage() {
  // Redirect to sign-in since we only use Google OAuth
  redirect('/sign-in');
}
