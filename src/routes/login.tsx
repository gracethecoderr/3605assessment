import { createFileRoute } from "@tanstack/react-router";
import { SignIn } from "@clerk/tanstack-react-start";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Banjg Property" }] }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-white text-primary">
            B
          </span>
          Banjg Property
        </div>
        <div className="max-w-xl">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Every repair, conversation and next step in one place.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-primary-foreground/75">
            Coordinate tenants, landlords and trades with an AI-assisted workspace built for
            property managers.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
          <ShieldCheck className="h-4 w-4" /> Secure workspace access
        </div>
      </section>

      <section className="flex items-center justify-center bg-card px-5 py-12">
        <SignIn
          routing="hash"
          forceRedirectUrl="/"
          withSignUp
          appearance={{
            elements: {
              rootBox: "w-full max-w-sm mx-auto",
              card: "shadow-none border-0 p-0 bg-transparent",
              headerTitle: "text-2xl font-semibold tracking-tight",
              headerSubtitle: "text-sm text-muted-foreground",
              formButtonPrimary:
                "bg-primary text-primary-foreground hover:bg-primary/90 h-11 rounded-md text-sm font-medium",
              footerActionLink: "text-primary hover:text-primary/80",
            },
          }}
        />
      </section>
    </main>
  );
}
