import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';

const phaseContexts = {
  onboarding: "You are on the welcome/onboarding screen of Schedulo. Help users understand what Schedulo does and how the 4-phase planning process works.",
  dates: "You are on the study period & calendar import screen. Help users set their study period dates and import/add calendar events. Explain what .ics files are and how to add manual events.",
  preferences: "You are on the study preferences screen. Help users define their preferred study days, times, max hours, and breaks.",
  courses: "You are on the course overview screen. Help users confirm detected courses, add missing ones, and understand course information fields.",
  courseDetail: "You are on the course detail screen. Help users fill in course information like difficulty, credit points, exam dates, and upload materials.",
  tasks: "You are on the task extraction screen. Help users review AI-extracted tasks, understand time estimates, and correct any inaccuracies.",
  feasibility: "You are on the feasibility check screen. Help users understand workload analysis, conflicts, and how to resolve feasibility issues.",
  plan: "You are on the study plan screen. Help users read the calendar, filter views, edit/reschedule tasks, and compare plan scenarios.",
  active: "You are on the active semester screen. Help users track progress, mark tasks complete, report delays, and understand their study plan.",
  replanning: "You are on the re-planning chat screen. Help users describe changes and understand re-planning proposals.",
  export: "You are on the export screen. Help users save, export, and archive their study plans."
};

export default function ContextChat({ phase, planId, suggestions, initialMessage, autoOpen, persistentTooltip }) {
  const [open, setOpen] = useState(!!autoOpen);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const [messages, setMessages] = useState(
    initialMessage
      ? [{ role: 'assistant', content: initialMessage }]
      : []
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const defaultSuggestions = suggestions || [
    "What should I do here?",
    "How does this work?",
    "I need help"
  ];

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const context = phaseContexts[phase] || "Help the student with their study planning in Schedulo.";
      const history = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
      
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are Schedulo, a friendly AI study planning assistant. Context: ${context}

Previous conversation:
${history}

Student's question: ${text}

Respond helpfully, concisely, and in a friendly tone. Use short paragraphs. If you don't know something specific about their data, give general guidance.`,
        model: 'gpt_5_mini'
      });

      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that. Please try again!" }]);
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {persistentTooltip && !tooltipDismissed && (
          <div className="flex items-end gap-2 max-w-[280px]">
            <div className="bg-white border border-blue-200 rounded-2xl rounded-br-sm shadow-lg px-4 py-3 text-sm text-gray-700 relative">
              <button
                onClick={() => setTooltipDismissed(true)}
                className="absolute top-1.5 right-1.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <p className="pr-4">👋 Hi! Click here to chat with me if you have any questions while creating your study plan. I'm here to help.</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setOpen(true)}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl shadow-blue-200 flex items-center justify-center transition-all hover:scale-105"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] h-[500px] bg-white rounded-2xl shadow-2xl border border-blue-100 flex flex-col overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <span className="font-semibold text-sm">Schedulo Assistant</span>
        </div>
        <button onClick={() => setOpen(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 text-center">Hi! I'm here to help. Ask me anything about this step.</p>
            <div className="space-y-2">
              {defaultSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && !loading && (
          <div className="space-y-2 mt-1">
            {defaultSuggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s)}
                className="w-full text-left text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-800 rounded-bl-md'
            }`}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown className="prose prose-sm max-w-none">{msg.content}</ReactMarkdown>
              ) : msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="p-3 border-t border-gray-100">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            className="flex-1 text-sm px-3 py-2 rounded-full border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="w-9 h-9 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}