import { Suspense } from "react"
import Loading from "@/components/loading"
import HomeClient from "./home-client"

export default function Home() {
  return (
    <main>
      <div>
        <Suspense fallback={<Loading />}>
          <HomeClient />
        </Suspense>
      </div>
    </main>
  )
}

