"use client";
import Image from "next/image";
import { Button } from "./ui/button";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "./ui/card";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const LoginForm = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center justify-center space-y-4">
        <Image src="/login.png" width={500} height={500} alt="login" />
        <p className="text-6xl font-extrabold text-indigo-400">
          Welcome back! to Neech Cli
        </p>
        <p className="font-medium text-zinc-400">
          Login to your account for allowing device flow
        </p>
      </div>
      <Card className="border-dashed border-2">
        <CardContent>
          <div className="grid gap-6">
            <div className="flex flex-col gap-4">
              <Button
                variant={"outline"}
                className="w-full h-full cursor-pointer"
                type="button"
                onClick={() =>
                  authClient.signIn.social({
                    provider: "github",
                    callbackURL: "http://localhost:3000",
                  })
                }>
                <Image
                  src={"/github.svg"}
                  width={16}
                  height={16}
                  alt="github"
                  className="size-4 dark:invert"
                />
                Continue with Github
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
