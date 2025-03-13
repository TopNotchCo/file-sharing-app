"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, ArrowRight, Share2, Shield, Zap, Users } from "lucide-react"

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

const FEATURES = [
  {
    icon: <Share2 className="h-6 w-6 text-[#9D4EDD]" />,
    title: "Instant Sharing",
    description: "Share files instantly with nearby devices with just a few clicks"
  },
  {
    icon: <Shield className="h-6 w-6 text-[#9D4EDD]" />,
    title: "End-to-End Encryption",
    description: "Your files are protected with state-of-the-art encryption"
  },
  {
    icon: <Zap className="h-6 w-6 text-[#9D4EDD]" />,
    title: "Lightning Fast",
    description: "Transfer files at maximum speed over your local network"
  },
  {
    icon: <Users className="h-6 w-6 text-[#9D4EDD]" />,
    title: "Multiple Devices",
    description: "Connect and share with multiple devices simultaneously"
  }
]

const TESTIMONIALS = [
  {
    name: "Sarah K.",
    role: "Designer",
    quote: "AirShare has completely transformed how I share design files with my team. So simple and fast!"
  },
  {
    name: "Michael T.",
    role: "Developer",
    quote: "I use AirShare daily to transfer files between my devices. It&apos;s become an essential tool in my workflow."
  },
  {
    name: "Jessica L.",
    role: "Photographer",
    quote: "Sharing high-resolution photos has never been easier. AirShare is a game-changer for my business."
  }
]

export default function OnboardingScreen({ userName, onUserNameChange, onComplete }: OnboardingScreenProps) {
  const [activeTestimonial, setActiveTestimonial] = useState(0)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [isNameValid, setIsNameValid] = useState(false)

  useEffect(() => {
    // Rotate testimonials every 5 seconds
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % TESTIMONIALS.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setIsNameValid(userName.trim().length > 0)
  }, [userName])

  const handleSetUserName = () => {
    if (userName.trim()) {
      onComplete()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isNameValid) {
      handleSetUserName()
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-background to-background/80">
      {/* Hero Section */}
      <div 
        className="text-center mb-12 max-w-3xl"
      >
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] opacity-75 blur"></div>
            <div className="relative bg-background rounded-full p-4">
              <Share2 className="h-12 w-12 text-[#9D4EDD]" />
            </div>
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] text-transparent bg-clip-text mb-4">
          Get Started
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          The fastest way to share files between your devices. No cloud, no uploads, just instant transfers.
        </p>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          {/* Get Started Card */}
          <div>
            <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#9D4EDD]/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none"></div>
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl">Create Your Identity</CardTitle>
                <CardDescription>Choose a username so others can identify you during file sharing</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">Username</Label>
                    <div className="relative">
                      <Input
                        id="name"
                        placeholder="Enter a username"
                        value={userName}
                        onChange={(e) => onUserNameChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="bg-secondary/50 border-[#9D4EDD]/30 pl-4 pr-10 py-6 text-lg rounded-xl focus:ring-2 focus:ring-[#9D4EDD]/50 transition-all"
                        autoFocus
                      />
                      {isNameValid && (
                        <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-2">
                <Button 
                  onClick={handleSetUserName} 
                  disabled={!isNameValid}
                  className={`w-full py-6 text-lg rounded-xl transition-all flex items-center justify-center gap-2 ${
                    isNameValid 
                      ? 'bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] hover:shadow-lg hover:shadow-[#9D4EDD]/20' 
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  Continue to Sharing <ArrowRight className="h-5 w-5 ml-1" />
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Testimonials */}
          <div className="mt-8">
            <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-muted-foreground">What people are saying</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative h-32">
                  {TESTIMONIALS.map((testimonial, index) => (
                    <div
                      key={index}
                      className={`absolute top-0 left-0 w-full transition-opacity duration-500 ease-in-out ${
                        activeTestimonial === index ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      <blockquote className="italic text-lg mb-4">&ldquo;{testimonial.quote}&rdquo;</blockquote>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-r from-[#9D4EDD] to-[#7B2CBF] flex items-center justify-center text-white font-medium">
                          {testimonial.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{testimonial.name}</p>
                          <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center mt-4 gap-2">
                  {TESTIMONIALS.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setActiveTestimonial(index)}
                      className={`h-2 rounded-full transition-all ${
                        activeTestimonial === index ? 'w-8 bg-[#9D4EDD]' : 'w-2 bg-[#9D4EDD]/30'
                      }`}
                      aria-label={`View testimonial ${index + 1}`}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="lg:col-span-2">
          {/* Features */}
          <div>
            <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20 mb-8">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Key Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {FEATURES.map((feature, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-1 bg-[#9D4EDD]/10 p-2 rounded-lg">
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className="font-medium">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* FAQ */}
          <div>
            <Card className="w-full bg-card/50 backdrop-blur-sm border-[#9D4EDD]/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {FAQ_ITEMS.map((faq, index) => (
                  <div
                    key={index}
                    className={`group border border-[#9D4EDD]/20 rounded-lg transition-all ${
                      expandedFaq === index ? 'bg-[#9D4EDD]/5' : ''
                    }`}
                  >
                    <button
                      className="w-full text-left px-4 py-3 flex items-center justify-between"
                      onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{faq.icon}</span>
                        <h3 className="font-medium">{faq.question}</h3>
                      </div>
                      <div className={`transform transition-transform duration-200 ${
                        expandedFaq === index ? 'rotate-180' : ''
                      }`}>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${
                        expandedFaq === index ? 'max-h-40' : 'max-h-0'
                      }`}
                    >
                      <p className="px-4 pb-4 text-muted-foreground">{faq.answer}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} AirShare. All rights reserved.</p>
        <p className="mt-1">Secure, fast, and private file sharing for everyone.</p>
      </div>
    </div>
  )
}
