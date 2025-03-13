import { Suspense } from "react"
import FileSharing from "@/components/file-sharing"
import Loading from "@/components/loading"

export default function Home() {
  return (
    <main>
      <div >
    
        <Suspense fallback={<Loading />}>
          <FileSharing />
        </Suspense>
      </div>
    </main>
  )
}

