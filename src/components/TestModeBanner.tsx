import { config } from "@/lib/config";

/** Shown to staff while Dropbox Sign is in test mode, so test contracts aren't sent to real customers. */
export function TestModeBanner({ isAdmin }: { isAdmin: boolean }) {
  if (config.demoMode || !config.dropboxSign?.testMode) return null;
  return (
    <div role="status" className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-[13px] leading-5 text-red-900">
      <strong className="font-semibold">Dropbox Sign is in test mode.</strong> Contracts sent now are stamped &ldquo;TEST&rdquo; and are{" "}
      <strong>not legally binding</strong>.
      {isAdmin ? <> To go live: a Dropbox Sign API plan, then set <code className="rounded bg-white px-1">DROPBOX_SIGN_TEST_MODE=false</code> in Netlify and redeploy.</> : " Ask an administrator before sending to real customers."}
    </div>
  );
}
