import { Suspense } from "react"
import FileSharing from "@/components/file-sharing"
import Loading from "@/components/loading"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0F0118] to-[#1A0B2E]">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-2 gradient-text">AirShare</h1>
        <p className="text-center text-muted-foreground mb-8">Seamless file sharing over your local network</p>
        <Suspense fallback={<Loading />}>
          <FileSharing />
        </Suspense>
      </div>
    </main>
  )
}

