"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface OnboardingScreenProps {
  userName: string
  onUserNameChange: (name: string) => void
  onComplete: () => void
}

const FAQ_ITEMS = [
  {
    icon: "🔒",
    question: "Is my data secure?",
    answer: "Yes, all file transfers are end-to-end encrypted and happen directly between devices on your local network. We never store your files on any servers."
  },
  {
    icon: "💰",
    question: "Do you sell my data?",
    answer: "No, we do not collect or sell any of your personal data. AirShare operates completely locally on your network."
  },
  {
    icon: "🔥",
    question: "If I delete my data, is it truly gone?",
    answer: "Yes, since files are only shared temporarily during the session and aren't stored on any servers, once deleted they are permanently removed."
  },
  {
    icon: "💸",
    question: "Does it cost money to use the app?",
    answer: "No, AirShare is completely free to use for local file sharing between devices."
  },
  {
    icon: "🔄",
    question: "How does file sharing work?",
    answer: "AirShare uses your local network to create direct connections between devices. Just drag and drop or select files to share them instantly with nearby devices."
  },
  {
    icon: "🔐",
    question: "Do you have access to my files?",
    answer: "No, we never have access to your files. All sharing happens directly between devices on your local network."
  }
] as const

export default function OnboardingScreen({ userName, onUserNameChange, onComplete }: OnboardingScreenProps) {
  const handleSetUserName = () => {
    if (userName.trim()) {
      onComplete()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
        <CardHeader>
          <CardDescription>Set your name to start sharing files</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={userName}
                onChange={(e) => onUserNameChange(e.target.value)}
                className="bg-secondary/50 border-[#9D4EDD]/30"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSetUserName} className="w-full bg-[#9D4EDD] hover:bg-[#7B2CBF]">
            Continue
          </Button>
        </CardFooter>
      </Card>

      <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
        <CardHeader>
          <CardTitle className="gradient-text">Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {FAQ_ITEMS.map((faq, index) => (
            <div
              key={index}
              className="group border-b border-[#9D4EDD]/20 last:border-0 cursor-pointer"
              onClick={() => {
                const el = document.getElementById(`faq-${index}`)
                if (el) {
                  el.style.maxHeight = el.style.maxHeight ? "" : `${el.scrollHeight}px`
                }
              }}
            >
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{faq.icon}</span>
                  <h3 className="font-medium text-lg">{faq.question}</h3>
                </div>
                <div className="transform transition-transform duration-200 group-hover:scale-110">
                  <svg
                    className="w-5 h-5 transform transition-transform duration-200 group-data-[state=open]:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <div
                id={`faq-${index}`}
                className="overflow-hidden max-h-0 transition-all duration-300 ease-in-out text-gray-400"
              >
                <p className="pb-4">{faq.answer}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
