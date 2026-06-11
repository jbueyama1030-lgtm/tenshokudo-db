import NextAuth, { DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"          // ← 追加

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
    } & DefaultSession["user"]
  }
}

const prisma = new PrismaClient()

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "メールアドレス", type: "email" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string }
        })
        
        if (!user) return null

        // ← 追加：パスワード検証
        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )
        if (!isValid) return null
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      }
    })
  ],
  // callbacks は変更なし
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub!
        session.user.role = token.role as string
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
      }
      return token
    }
  },
  pages: {
    signIn: "/login",
  },
})