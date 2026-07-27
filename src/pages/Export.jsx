import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Download, ArrowLeft, Calendar, FileText, Archive, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import PhaseIndicator from '@/components/schedulo/PhaseIndicator';
import StepHeader from '@/components/schedulo/StepHeader';
import ContextChat from '@/components/schedulo/ContextChat';
import { motion } from 'framer-motion';

export default function Export() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [exportRange, setExportRange] = useState('full');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const p = await base44.entities.StudyPlan.get(planId);
      setPlan(p);
      setCustomStart(p.start_date || '');
      setCustomEnd(p.end_date || '');
      const t = await base44.entities.StudyTask.filter({ plan_id: planId });
      setTasks(t);
      setLoading(false);
    };
    load();
  }, [planId]);

  const getFilteredTasks = () => {
    if (exportRange === 'full') return tasks;
    return tasks.filter((t) => {
      if (!t.scheduled_date) return false;
      return t.scheduled_date >= customStart && t.scheduled_date <= customEnd;
    });
  };

  const exportICS = () => {
    const filtered = getFilteredTasks();
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Schedulo//EN\n';

    filtered.forEach((task) => {
      if (!task.scheduled_date || !task.scheduled_start || !task.scheduled_end) return;
      const dateStr = task.scheduled_date.replace(/-/g, '');
      const startTime = task.scheduled_start.replace(':', '') + '00';
      const endTime = task.scheduled_end.replace(':', '') + '00';
      ics += `BEGIN:VEVENT\n`;
      ics += `DTSTART:${dateStr}T${startTime}\n`;
      ics += `DTEND:${dateStr}T${endTime}\n`;
      ics += `SUMMARY:${task.title} (${task.course_name})\n`;
      ics += `DESCRIPTION:Course: ${task.course_name}\\nType: ${task.task_type}\\nPriority: ${task.priority}\\nEstimated: ${task.estimated_hours}h\\nStatus: ${task.status}\n`;
      ics += `END:VEVENT\n`;
    });

    ics += 'END:VCALENDAR';

    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedulo-plan-${planId}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const filtered = getFilteredTasks();
    const headers = ['Course', 'Task', 'Type', 'Date', 'Start Time', 'End Time', 'Estimated Hours', 'Deadline', 'Priority', 'Status'];
    const rows = filtered.map((t) => [
    t.course_name, t.title, t.task_type, t.scheduled_date, t.scheduled_start, t.scheduled_end,
    t.estimated_hours, t.deadline || '', t.priority, t.status]
    );

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell || ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedulo-plan-${planId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const archivePlan = async () => {
    await base44.entities.StudyPlan.update(planId, { status: 'archived' });
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>);

  }

  const filtered = getFilteredTasks();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <PhaseIndicator currentPhase="active" currentStep={11} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <StepHeader
            icon={Download}
            title="Export & Archive"
            description="Save your study plan, export it to your calendar app, or archive it for future reference." />
          

          {/* Plan summary */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Plan Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-blue-600">{tasks.length}</p>
                <p className="text-xs text-gray-400">Total tasks</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600">{tasks.filter((t) => t.status === 'completed').length}</p>
                <p className="text-xs text-gray-400">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">{tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0).toFixed(0)}h</p>
                <p className="text-xs text-gray-400">Total hours</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{plan?.status}</p>
                <p className="text-xs text-gray-400">Status</p>
              </div>
            </div>
          </div>

          {/* Export range */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Export period</h3>
            <RadioGroup value={exportRange} onValueChange={setExportRange} className="space-y-3">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full" id="full" />
                <Label htmlFor="full" className="cursor-pointer">Full plan ({plan?.start_date} to {plan?.end_date})</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom" className="cursor-pointer">Custom date range</Label>
              </div>
            </RadioGroup>
            {exportRange === 'custom' &&
            <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <Label className="text-sm text-gray-600">From</Label>
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} min={plan?.start_date} max={plan?.end_date} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm text-gray-600">To</Label>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} min={plan?.start_date} max={plan?.end_date} className="mt-1" />
                </div>
              </div>
            }
            <p className="text-sm text-gray-400 mt-3">{filtered.length} tasks will be exported.</p>
          </div>

          {/* Export buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <button onClick={exportICS} className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-left group text-2xl">
              <Calendar className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-gray-900">Export as .ics</h3>
              <p className="text-sm text-gray-400 mt-1">Import into Google Calendar, Apple Calendar, Outlook, or any calendar app.</p>
            </button>
            <button onClick={exportCSV} className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-left group hidden">
              <FileText className="w-8 h-8 text-emerald-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-gray-900">Export as CSV</h3>
              <p className="text-sm text-gray-400 mt-1">Open in Excel, Google Sheets, or any spreadsheet tool.</p>
            </button>
          </div>

          {/* Archive */}
          <div className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm mb-6 hidden">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Archive className="w-4 h-4 text-gray-500" /> Archive this plan
                </h3>
                <p className="text-sm text-gray-400 mt-1">Archive the plan when the semester is over. You can still view it later.</p>
              </div>
              <Button variant="outline" onClick={archivePlan}>Archive</Button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Button variant="ghost" onClick={() => navigate(`/plan/${planId}/active`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to plan
            </Button>
          </div>
        </motion.div>
      </div>
      <ContextChat phase="export" planId={planId} suggestions={[
      "How do I import .ics into Google Calendar?",
      "Can I export only next week?",
      "What happens when I archive?"]
      } />
    </div>);

}