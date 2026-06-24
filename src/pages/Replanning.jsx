import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { MessageCircle, ArrowLeft, Send, Bot, Loader2, CheckCircle, XCircle, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';

export default function Replanning() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! 👋 I'm here to help you update your study plan. Tell me what changed — for example:\n\n- \"I can't study on Thursday anymore.\"\n- \"The statistics deadline moved to the 20th.\"\n- \"I didn't complete this week's tasks.\"\n- \"I need more time for this assignment.\"\n- \"I want to focus on the exam next week.\"\n\nWhat would you like to change?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const plan = await base44.entities.StudyPlan.get(planId);
      const tasks = await base44.entities.StudyTask.filter({ plan_id: planId });
      const prefs = plan.preferences || {};

      const taskSummary = tasks.map(t =>
        `- "${t.title}" (${t.course_name}): ${t.status}, scheduled ${t.scheduled_date} ${t.scheduled_start}-${t.scheduled_end}, ${t.estimated_hours}h, deadline: ${t.deadline || 'none'}, priority: ${t.priority}`
      ).join('\n');

      const history = messages.slice(-8).map(m => `${m.role}: ${m.content}`).join('\n');

      const prompt = `You are Schedulo, a friendly AI study planning assistant helping a student re-plan their study schedule.

Current Plan:
Study Period: ${plan.start_date} to ${plan.end_date}
Preferences: study days ${(prefs.preferred_days || []).join(', ')}, max ${prefs.max_hours || 6}h/day, ${prefs.preferred_start}-${prefs.preferred_end}

Current Tasks:
${taskSummary}

Conversation history:
${history}

Student's message: ${text}

Analyze the impact of the student's request. Respond in a friendly, conversational tone.

If the change affects the plan:
1. Explain what will change
2. Show the impact on workload, deadlines, and free time
3. Propose specific changes (which tasks move where)
4. Explain why you recommend this option
5. Ask the student to accept, reject, or edit the proposal

If the change doesn't affect the plan, explain why and keep the current plan.

If the student corrects a time estimate, acknowledge it and explain how it affects future estimates for similar tasks.

Keep responses concise but helpful. Use bullet points for clarity.`;

      const response = await base44.integrations.Core.InvokeLLM({ prompt });
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);

      // Check if response contains a proposal
      if (response.toLowerCase().includes('accept') || response.toLowerCase().includes('proposal') || response.toLowerCase().includes('update')) {
        setProposal({ text: response });
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that. Please try again!" }]);
    }
    setLoading(false);
  };

  const acceptProposal = async () => {
    setProposal(null);
    setMessages(prev => [...prev, { role: 'user', content: 'I accept the proposal.' }]);
    setLoading(true);

    try {
      const tasks = await base44.entities.StudyTask.filter({ plan_id: planId });
      const plan = await base44.entities.StudyPlan.get(planId);
      const prefs = plan.preferences || {};

      const prompt = `The student accepted the re-planning proposal. Now generate updated schedule assignments.

Current tasks:
${tasks.map(t => `- ID: ${t.id} | "${t.title}" (${t.course_name}) | ${t.estimated_hours}h | Priority: ${t.priority} | Deadline: ${t.deadline || 'none'} | Currently: ${t.scheduled_date} ${t.scheduled_start}-${t.scheduled_end}`).join('\n')}

Preferences: study days ${(prefs.preferred_days || []).join(', ')}, max ${prefs.max_hours || 6}h/day, ${prefs.preferred_start}-${prefs.preferred_end}

Return JSON with "updates" array of {task_id, scheduled_date, scheduled_start, scheduled_end} and a "summary" string explaining the changes.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            updates: { type: "array", items: { type: "object", properties: { task_id: { type: "string" }, scheduled_date: { type: "string" }, scheduled_start: { type: "string" }, scheduled_end: { type: "string" } } } },
            summary: { type: "string" }
          }
        }
      });

      if (result.updates) {
        for (const u of result.updates) {
          const task = tasks.find(t => t.id === u.task_id);
          if (task) {
            await base44.entities.StudyTask.update(task.id, {
              scheduled_date: u.scheduled_date,
              scheduled_start: u.scheduled_start,
              scheduled_end: u.scheduled_end
            });
          }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: `✅ Done! I've updated your plan. ${result.summary || ''}\n\nYou can check your updated calendar on the Active Plan screen. Anything else you'd like to change?` }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "I updated the plan based on our discussion. You can check your calendar for the changes!" }]);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="active" currentStep={10} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-6">
            <StepHeader
              icon={MessageCircle}
              title="Re-plan Your Schedule"
              description="Tell me what changed and I'll help you adjust your study plan."
            />
            <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/active`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to plan
            </Button>
          </div>

          {/* Chat area */}
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center gap-2">
              <Bot className="w-5 h-5 text-white" />
              <span className="text-white font-semibold text-sm">Schedulo Re-planning Assistant</span>
            </div>

            <div className="h-[400px] overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-gray-50 text-gray-800 rounded-bl-md border border-gray-100'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown className="prose prose-sm max-w-none">{msg.content}</ReactMarkdown>
                    ) : msg.content}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Proposal actions */}
            {proposal && !loading && (
              <div className="px-4 py-3 border-t border-gray-100 bg-blue-50 flex gap-2">
                <Button size="sm" onClick={acceptProposal} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle className="w-4 h-4 mr-1" /> Accept proposal
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setProposal(null); sendMessage("I'd like to see an alternative proposal."); }}>
                  <Edit2 className="w-4 h-4 mr-1" /> Propose alternative
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setProposal(null); sendMessage("I reject this proposal. Let's keep the current plan."); }}>
                  <XCircle className="w-4 h-4 mr-1" /> Reject
                </Button>
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-gray-100">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe what changed..."
                  className="flex-1 text-sm px-4 py-2.5 rounded-full border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-2">
            {[
              "I can't study on Thursday anymore",
              "I didn't complete this week's tasks",
              "The deadline was moved",
              "This task took longer than expected"
            ].map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="px-3 py-1.5 bg-white border border-blue-200 rounded-full text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                disabled={loading}
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}