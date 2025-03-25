import { Suspense } from "react"
import FileSharing from "@/components/file-sharing"
import { LANFileSharing } from "@/components/lan-file-sharing"
import Loading from "@/components/loading"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function Home() {
  return (
    <main className="container py-6">
      <h1 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-purple-500 to-pink-500 text-transparent bg-clip-text">
        AirShare - P2P File Sharing
      </h1>

      <Tabs defaultValue="webtorrent" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="webtorrent">WebTorrent Sharing</TabsTrigger>
          <TabsTrigger value="lan">LAN Discovery</TabsTrigger>
        </TabsList>
        
        <TabsContent value="webtorrent">
          <Suspense fallback={<Loading />}>
            <FileSharing />
          </Suspense>
        </TabsContent>
        
        <TabsContent value="lan">
          <Suspense fallback={<Loading />}>
            <LANFileSharing />
          </Suspense>
        </TabsContent>
      </Tabs>
    </main>
  )
}

