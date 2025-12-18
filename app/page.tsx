import { ApiSetupForm } from "@/components/setup/api-setup-form"

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 pt-14">
      <div className="mb-8 text-center">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Graft</h1>
        <p className="text-muted-foreground">
          Visualize your Craft document connections
        </p>
      </div>
      <ApiSetupForm />
      <div className="mt-8 max-w-md text-center text-sm text-muted-foreground">
        <p>
          Your API credentials are stored locally in your browser only. They are
          passed via headers through a proxy to avoid CORS issues, but never
          logged or stored on the server.
        </p>
      </div>
    </div>
  )
}
