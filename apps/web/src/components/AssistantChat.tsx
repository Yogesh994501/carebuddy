import { useState, useRef, useEffect } from 'react';
import { AssistantMark } from './AssistantMark';
import { Send, Trash2, ShieldAlert, Sparkles, AlertTriangle, CheckCircle2, X } from 'lucide-react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  sourceLabel?: 'From your CareBuddy records' | 'General information';
  createdAt: string;
  isEmergency?: boolean;
}

export interface AssistantChatProps {
  profileId: string;
  elderlyFirstName: string;
  isOwner: boolean;
  initialConsentGranted?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function AssistantChat({
  profileId,
  elderlyFirstName,
  isOwner,
  initialConsentGranted = false,
  isOpen,
  onClose
}: AssistantChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      content: `Hello! I'm Sprig, your friendly CareBuddy assistant. I can help explain ${elderlyFirstName}’s daily routine, check upcoming appointments, or guide you through recording doses.`,
      sourceLabel: 'General information',
      createdAt: new Date().toISOString()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sprigState, setSprigState] = useState<'idle' | 'thinking' | 'alert'>('idle');
  const [consentGranted, setConsentGranted] = useState(initialConsentGranted);
  const [updatingConsent, setUpdatingConsent] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isSubmitting) return;

    setInputValue('');
    const userMsgId = `user-${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, newMsg]);
    setIsSubmitting(true);
    setSprigState('thinking');

    try {
      const res = await fetch(`/api/profiles/${profileId}/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-carebuddy-request': '1'
        },
        body: JSON.stringify({ message: text })
      });

      if (!res.ok) {
        throw new Error('Assistant unavailable');
      }

      const data = await res.json();
      const assistantMsg: ChatMessage = {
        id: data.messageId || `asst-${Date.now()}`,
        role: 'model',
        content: data.reply,
        sourceLabel: data.sourceLabel,
        createdAt: new Date().toISOString(),
        isEmergency: data.isEmergency
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setSprigState(data.isEmergency ? 'alert' : 'idle');
    } catch {
      // Fallback response for offline or network issues
      const fallbackMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'model',
        content: "I'm having a little trouble connecting right now. CareBuddy gives information from your records and general education. In an emergency, please call your local emergency number.",
        sourceLabel: 'General information',
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      setSprigState('idle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleConsent = async () => {
    if (!isOwner || updatingConsent) return;
    setUpdatingConsent(true);
    const target = !consentGranted;

    try {
      const res = await fetch(`/api/profiles/${profileId}/assistant/consent`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-carebuddy-request': '1'
        },
        body: JSON.stringify({ granted: target })
      });
      if (res.ok) {
        setConsentGranted(target);
      }
    } catch {
      // Keep optimistic or current
    } finally {
      setUpdatingConsent(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'model',
        content: "Conversation history cleared. How else can I assist you with today's routine?",
        sourceLabel: 'General information',
        createdAt: new Date().toISOString()
      }
    ]);
    setSprigState('idle');
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="CareBuddy Assistant Sprig"
      className="fixed inset-y-0 right-0 w-full sm:w-[440px] bg-[#F6F8F5] shadow-2xl z-50 flex flex-col border-l border-[#D1DCD6]"
    >
      {/* Header */}
      <div className="bg-white px-5 py-4 border-b border-[#D1DCD6] flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <AssistantMark state={sprigState} size={48} label="Sprig Companion" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-[#1E2B28]">Sprig</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E7F0EC] text-[#397B68]">
                Care Assistant
              </span>
            </div>
            <p className="text-xs text-gray-500">Friendly companion &amp; routine navigator</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleClearHistory}
            title="Clear Chat History"
            aria-label="Clear Chat History"
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close Assistant"
            aria-label="Close Assistant"
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mandatory Persistent Disclaimer (Section 10 & Gate 9) */}
      <div className="bg-[#EAF3EF] px-4 py-2.5 border-b border-[#D1DCD6] flex items-start gap-2 text-[11px] text-[#1E2B28] leading-tight">
        <ShieldAlert className="w-4 h-4 text-[#397B68] shrink-0 mt-0.5" />
        <p>
          <strong>Notice:</strong> CareBuddy gives information from your records and general education. It does not
          diagnose, prescribe, change doses or check drug interactions. In an emergency, call your local emergency
          number.
        </p>
      </div>

      {/* Consent Banner (Section 10) */}
      <div className="bg-white px-4 py-2 border-b border-gray-200 flex items-center justify-between text-xs">
        <span className="text-gray-600 flex items-center gap-1.5 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-[#D99B43]" />
          Record-sharing with assistant:
        </span>
        {isOwner ? (
          <button
            type="button"
            onClick={handleToggleConsent}
            disabled={updatingConsent}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
              consentGranted ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {consentGranted ? 'Enabled (Active)' : 'Disabled (Click to enable)'}
          </button>
        ) : (
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
              consentGranted ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-100'
            }`}
          >
            {consentGranted ? 'Enabled by owner' : 'Disabled by owner'}
          </span>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" aria-live="polite">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} space-y-1`}
          >
            <div className="flex items-end gap-2 max-w-[85%]">
              {m.role === 'model' && (
                <div className="shrink-0 mb-1">
                  <AssistantMark state={m.isEmergency ? 'alert' : 'idle'} size={32} />
                </div>
              )}

              <div
                className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#397B68] text-white rounded-br-xs shadow-sm'
                    : m.isEmergency
                    ? 'bg-red-50 text-red-900 border-2 border-red-400 rounded-bl-xs'
                    : 'bg-white text-[#1E2B28] border border-[#D1DCD6] rounded-bl-xs shadow-xs'
                }`}
              >
                {m.content}
              </div>
            </div>

            {/* Source Label (Section 10 requirement) */}
            {m.role === 'model' && m.sourceLabel && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded ml-10 flex items-center gap-1 ${
                  m.sourceLabel === 'From your CareBuddy records'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {m.sourceLabel === 'From your CareBuddy records' ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-gray-500" />
                )}
                {m.sourceLabel}
              </span>
            )}
          </div>
        ))}

        {isSubmitting && (
          <div className="flex items-center gap-2 text-xs text-gray-500 ml-10 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-[#397B68]" />
            Sprig is thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div className="px-4 py-2 border-t border-gray-200 bg-white flex items-center gap-2 overflow-x-auto text-[11px] no-scrollbar">
        <button
          type="button"
          onClick={() => handleSendMessage("What medications are scheduled today?")}
          className="whitespace-nowrap px-2.5 py-1 rounded-full bg-[#F6F8F5] text-gray-700 hover:bg-gray-200 border border-gray-300 transition-colors"
        >
          Scheduled today?
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("When is my next appointment?")}
          className="whitespace-nowrap px-2.5 py-1 rounded-full bg-[#F6F8F5] text-gray-700 hover:bg-gray-200 border border-gray-300 transition-colors"
        >
          Next appointment?
        </button>
        <button
          type="button"
          onClick={() => handleSendMessage("How do I snooze a dose?")}
          className="whitespace-nowrap px-2.5 py-1 rounded-full bg-[#F6F8F5] text-gray-700 hover:bg-gray-200 border border-gray-300 transition-colors"
        >
          How to snooze?
        </button>
      </div>

      {/* Message Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-4 bg-white border-t border-[#D1DCD6] flex items-center gap-2"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask Sprig about schedules, doses, or appointments..."
          disabled={isSubmitting}
          className="flex-1 p-2.5 rounded-xl border border-gray-300 text-xs sm:text-sm focus:ring-2 focus:ring-[#397B68] focus:border-transparent outline-none"
        />
        <button
          type="submit"
          disabled={isSubmitting || !inputValue.trim()}
          aria-label="Send message to Sprig"
          className="p-2.5 rounded-xl bg-[#397B68] text-white hover:bg-[#2e6253] transition-all disabled:opacity-50 shadow-sm"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
