"use client";

import { SignUp } from "@clerk/nextjs";

// Header Component (inline)
function Header() {
  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg">O</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">OTCR</h1>
              <p className="text-xs text-gray-500 font-medium">Consulting Platform</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <Header />
      
      <div className="pt-16 pb-12 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section - Left Side */}
          <div className="grid lg:grid-cols-2 gap-16 items-center min-h-[70vh]">
            {/* Left Content */}
            <div className="space-y-8 animate-fade-in">
              <div>
                <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                  Create your{" "}
                  <span className="bg-gradient-to-r from-indigo-600 to-purple-700 bg-clip-text text-transparent">
                    OTCR
                  </span>{" "}
                  account
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-lg">
                  Set up your consultant account to access the OTCR dashboard and start managing your projects.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-6 max-w-md">
                <div className="text-center p-4">
                  <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Project Access</h3>
                  <p className="text-sm text-gray-600">Manage your consulting projects</p>
                </div>
                
                <div className="text-center p-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Analytics</h3>
                  <p className="text-sm text-gray-600">Track your performance metrics</p>
                </div>
              </div>
            </div>

            {/* Right Content - Sign Up Form */}
            <div className="flex justify-center lg:justify-end animate-slide-up">
              <div className="w-full max-w-md">
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
                  <SignUp 
                    path="/sign-up" 
                    routing="path" 
                    signInUrl="/sign-in"
                    redirectUrl="/dashboard"
                    appearance={{
                      baseTheme: undefined,
                      elements: {
                        footer: { display: "none" },
                        card: { 
                          boxShadow: "none", 
                          border: "none",
                          background: "transparent",
                          padding: "0"
                        },
                        headerTitle: { display: "none" },
                        headerSubtitle: { display: "none" },
                        socialButtonsBlockButton: {
                          borderRadius: "8px",
                          border: "1px solid #d1d5db",
                          backgroundColor: "white",
                          fontSize: "15px",
                          fontWeight: "500",
                          color: "#374151",
                          boxShadow: "none",
                          padding: "14px 18px",
                          minHeight: "48px",
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "10px",
                          transition: "background-color 0.15s ease",
                          "&:hover": {
                            backgroundColor: "#f9fafb",
                            boxShadow: "none"
                          }
                        },
                        socialButtonsBlockButtonText: {
                          fontSize: "15px",
                          fontWeight: "500",
                          color: "#374151",
                          flex: "1",
                          textAlign: "center"
                        },
                        socialButtonsProviderIcon: {
                          width: "18px",
                          height: "18px",
                          flexShrink: "0"
                        },
                        socialButtonsBlockButtonArrow: {
                          display: "none"
                        },
                        socialButtonsLastUsed: {
                          display: "none"
                        },
                        socialButtonsLastUsedText: {
                          display: "none"
                        },
                        formButtonPrimary: {
                          backgroundColor: "#4f46e5",
                          borderRadius: "8px",
                          fontWeight: "500",
                          fontSize: "14px",
                          boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)"
                        },
                        formFieldInput: {
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                          backgroundColor: "white",
                          fontSize: "14px",
                          padding: "0.75rem 1rem"
                        },
                        formFieldInput__focus: {
                          borderColor: "#6366f1",
                          boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.1)"
                        }
                      },
                      variables: {
                        colorPrimary: "#4f46e5",
                        borderRadius: "8px"
                      }
                    }}
                  />
                </div>

                {/* Footer */}
                <div className="text-center mt-6 space-y-3">
                  <p className="text-sm text-gray-500">
                    By signing up, you agree to our{" "}
                    <a href="#" className="text-indigo-600 hover:text-indigo-700 font-medium transition-colors">Terms of Service</a>
                  </p>
                  <p className="text-sm text-gray-500">
                    Already have an account?{" "}
                    <a href="/sign-in" className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors">
                      Sign in here
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
