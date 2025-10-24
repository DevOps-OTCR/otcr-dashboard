import { prisma } from "./prisma"

export async function testDatabaseConnection() {
  try {
    // Test the connection
    await prisma.$connect()
    console.log("✅ Database connected successfully!")
    
    // Test a simple query
    const userCount = await prisma.user.count()
    console.log(`📊 Current users in database: ${userCount}`)
    
    return { success: true, userCount }
  } catch (error) {
    console.error("❌ Database connection failed:", error)
    return { success: false, error: error.message }
  } finally {
    await prisma.$disconnect()
  }
}
