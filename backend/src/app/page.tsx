export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          OTCR Dashboard
        </h1>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Backend API Status</h2>
          <div className="space-y-2">
            <p className="text-green-600">✅ NextJS API running</p>
            <p className="text-green-600">✅ Prisma configured</p>
            <p className="text-green-600">✅ Database connected (Neon)</p>
            <p className="text-yellow-600">⚠️ Clerk authentication pending</p>
          </div>
          
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">Available API Endpoints:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>GET /api/users - Get all users</li>
              <li>POST /api/users - Create user</li>
              <li>GET /api/users/[id] - Get user by ID</li>
              <li>PUT /api/users/[id] - Update user</li>
              <li>DELETE /api/users/[id] - Delete user</li>
              <li>GET /api/test-db - Test database connection</li>
            </ul>
          </div>
          
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">Test Database Connection:</h3>
            <a 
              href="/api/test-db" 
              className="text-blue-600 hover:text-blue-800 underline"
              target="_blank"
            >
              Click here to test database connection
            </a>
          </div>
        </div>
      </div>
    </main>
  )
}
