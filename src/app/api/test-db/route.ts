import { NextResponse } from "next/server"
import { testDatabaseConnection } from "@/lib/test-db"

export async function GET() {
  try {
    const result = await testDatabaseConnection()
    
    if (result.success) {
      return NextResponse.json({
        status: "success",
        message: "Database connection successful",
        userCount: result.userCount
      })
    } else {
      return NextResponse.json({
        status: "error",
        message: "Database connection failed",
        error: result.error
      }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({
      status: "error",
      message: "Database test failed",
      error: error.message
    }, { status: 500 })
  }
}
