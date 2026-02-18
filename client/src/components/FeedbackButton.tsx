import { useState } from "react";

interface FeedbackButtonProps {
  repo: string;
  apiUrl?: string;
  position?: "bottom-right" | "bottom-left";
}

type FeedbackType = "bug" | "feature" | "feedback";
type Status = "idle" | "submitting" | "success" | "error";

const typeConfig: Record<FeedbackType, { label: string; emoji: string }> = {
  bug: { label: "Bug", emoji: "🐛" },
  feature: { label: "Feature", emoji: "💡" },
  feedback: { label: "Feedback", emoji: "💬" },
};

export function FeedbackButton({
  repo,
  apiUrl = "/api/feedback",
  position = "bottom-right",
}: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("feedback");
  const [shortDesc, setShortDesc] = useState("");
  const [details, setDetails] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const positionClass =
    position === "bottom-right" ? "right-4" : "left-4";

  function reset() {
    setType("feedback");
    setShortDesc("");
    setDetails("");
    setHoneypot("");
    setStatus("idle");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo,
          title: shortDesc,
          description: details,
          type,
          _hp: honeypot,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("success");
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) setStatus("idle");
        }}
        className={`fixed bottom-4 ${positionClass} z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg transition-all hover:bg-blue-600 hover:scale-105 active:scale-95`}
        aria-label="Send feedback"
      >
        {open ? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Feedback modal */}
      {open && (
        <div
          className={`fixed bottom-20 ${positionClass} z-50 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800`}
        >
          {status === "success" ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <svg className="h-10 w-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-medium text-gray-900 dark:text-white">Tak for din feedback!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Vi har oprettet et issue.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <h3 className="font-semibold text-gray-900 dark:text-white">Send feedback</h3>

              {/* Type selector */}
              <div className="flex gap-1.5">
                {(Object.keys(typeConfig) as FeedbackType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                      type === t
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    {typeConfig[t].emoji} {typeConfig[t].label}
                  </button>
                ))}
              </div>

              {/* Kort beskrivelse */}
              <input
                type="text"
                placeholder="Kort beskrivelse"
                value={shortDesc}
                onChange={(e) => setShortDesc(e.target.value)}
                required
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
              />

              {/* Uddybende */}
              <textarea
                placeholder="Uddyb gerne..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                className="resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
              />

              {/* Honeypot - hidden from real users */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
                aria-hidden="true"
              />

              {/* Error message */}
              {status === "error" && (
                <p className="text-xs text-red-500">Noget gik galt. Prøv igen.</p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={status === "submitting"}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
              >
                {status === "submitting" ? "Sender..." : "Send"}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
