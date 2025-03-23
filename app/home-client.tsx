"use client"

import { Suspense } from "react"
import Loading from "@/components/loading"
import dynamic from "next/dynamic"

// Import FileSharing component with SSR disabled
const FileSharing = dynamic(
  () => import("@/components/file-sharing"),
  { ssr: false }
)

export default function HomeClient() {
  return (
    <Suspense fallback={<Loading />}>
      <FileSharing />
    </Suspense>
  )
} 