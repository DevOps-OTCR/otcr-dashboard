"use client";
import { useAuth, useUser, SignOutButton } from "@clerk/nextjs";
import { useState } from "react";

export default function Dashboard() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [backendData, setBackendData] = useState<any>(null);

  const fetchBackend = async () => {
    const token = await getToken();
    const res = await fetch("http://localhost:3001/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setBackendData(data);
  };

  return (
    <main className="p-8 flex flex-col gap-4">
      <h1>Hello, {user?.firstName}</h1>

      <div className="flex gap-4">
        <button onClick={fetchBackend} className="p-2 bg-blue-500 text-white rounded">
          Call Backend
        </button>

        <SignOutButton>
          <button className="p-2 bg-red-500 text-white rounded">
            Sign Out
          </button>
        </SignOutButton>
      </div>

      {backendData && (
        <pre className="mt-4 p-2 bg-gray-100 rounded overflow-auto max-h-64">
          {JSON.stringify(backendData, null, 2)}
        </pre>
      )}
    </main>
  );
}
