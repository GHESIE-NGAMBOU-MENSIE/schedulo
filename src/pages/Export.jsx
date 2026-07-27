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
import { jsPDF } from 'jspdf';

export default function Export() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
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
      const c = await base44.entities.Course.filter({ plan_id: planId });
      setTasks(t);
      setCourses(c);
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

  const COURSE_PDF_COLORS = [
    { fill: [219, 234, 254], text: [30, 58, 138] },
    { fill: [237, 233, 254], text: [76, 29, 149] },
    { fill: [209, 250, 229], text: [6, 78, 59] },
    { fill: [254, 243, 199], text: [120, 53, 15] },
    { fill: [254, 205, 211], text: [136, 19, 55] },
    { fill: [207, 250, 254], text: [8, 51, 68] },
    { fill: [255, 237, 213], text: [124, 45, 18] },
    { fill: [252, 231, 243], text: [131, 24, 67] },
    { fill: [204, 251, 241], text: [11, 94, 81] },
    { fill: [224, 231, 255], text: [49, 46, 129] }
  ];

  const exportPDF = () => {
    const filtered = getFilteredTasks().filter((t) => t.scheduled_date && t.scheduled_start && t.scheduled_end);
    if (filtered.length === 0 || !plan?.start_date || !plan?.end_date) return;

    const courseColorMap = {};
    courses.forEach((c, i) => {
      const color = COURSE_PDF_COLORS[i % COURSE_PDF_COLORS.length];
      courseColorMap[c.id] = color;
      courseColorMap[c.name] = color;
    });
    const getColor = (task) =>
      courseColorMap[task.course_id] || courseColorMap[task.course_name] || COURSE_PDF_COLORS[0];

    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    let minMin = 24 * 60, maxMin = 0;
    filtered.forEach((t) => {
      minMin = Math.min(minMin, toMin(t.scheduled_start));
      maxMin = Math.max(maxMin, toMin(t.scheduled_end));
    });
    const startHour = Math.max(0, Math.floor(minMin / 60) - 1);
    const endHour = Math.min(24, Math.ceil(maxMin / 60) + 1);
    const spanMin = (endHour - startHour) * 60;

    const ds = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const weeks = [];
    let cur = new Date(plan.start_date + 'T00:00:00');
    const end = new Date(plan.end_date + 'T00:00:00');
    while (cur <= end) {
      const monday = new Date(cur);
      monday.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
      const weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
      });
      weeks.push(weekDates);
      const next = new Date(monday); next.setDate(monday.getDate() + 7);
      cur = next;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297, pageH = 210;
    const margin = 10, labelW = 14;
    const gridX = margin + labelW;
    const gridW = pageW - margin - gridX;
    const colW = gridW / 7;
    const titleH = 14, headerH = 6;
    const gridY = margin + titleH + headerH;
    const gridH = pageH - margin - gridY;
    const minToY = (mins) => gridY + ((mins - startHour * 60) / spanMin) * gridH;
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    weeks.forEach((weekDates, wi) => {
      if (wi > 0) doc.addPage();
      doc.setFontSize(13); doc.setTextColor(30, 41, 59);
      doc.text(`Schedulo Study Plan — ${fmt(weekDates[0])} to ${fmt(weekDates[6])}`, margin, margin + 6);
      doc.setFontSize(9); doc.setTextColor(100, 116, 139);
      doc.text(plan?.name || '', margin, margin + 11);

      weekDates.forEach((d, i) => {
        const x = gridX + i * colW;
        doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252);
        doc.rect(x, gridY - headerH, colW, headerH, 'FD');
        doc.setFontSize(8); doc.setTextColor(71, 85, 105);
        doc.text(`${dayNames[i]} ${d.getDate()}/${d.getMonth() + 1}`, x + 1, gridY - 2);
      });

      doc.setFontSize(7); doc.setTextColor(148, 163, 184);
      for (let h = startHour; h <= endHour; h++) {
        const y = minToY(h * 60);
        doc.setDrawColor(241, 245, 249);
        doc.line(gridX, y, gridX + gridW, y);
        doc.text(`${h}:00`, margin, y - 0.5);
      }
      for (let i = 0; i <= 7; i++) {
        doc.setDrawColor(226, 232, 240);
        doc.line(gridX + i * colW, gridY - headerH, gridX + i * colW, gridY + gridH);
      }

      weekDates.forEach((d, i) => {
        const dateStr = ds(d);
        const dayTasks = filtered.filter((t) => t.scheduled_date === dateStr);
        dayTasks.forEach((t) => {
          const y = minToY(toMin(t.scheduled_start));
          const h = Math.max(((toMin(t.scheduled_end) - toMin(t.scheduled_start)) / spanMin) * gridH, 4);
          const x = gridX + i * colW + 0.5;
          const w = colW - 1;
          const color = getColor(t);
          doc.setFillColor(color.fill[0], color.fill[1], color.fill[2]);
          doc.setDrawColor(color.text[0], color.text[1], color.text[2]);
          doc.rect(x, y, w, h, 'FD');
          doc.setTextColor(color.text[0], color.text[1], color.text[2]);
          doc.setFontSize(6.5);
          doc.text(`${t.course_name} — ${t.title}`, x + 0.8, y + 3, { maxWidth: w - 1.6 });
        });
      });
    });

    doc.save(`schedulo-plan-${planId}.pdf`);
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
          </div>

          {/* Export buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <button onClick={exportICS} className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-left group text-2xl">
              <Calendar className="w-8 h-8 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-gray-900">Export as .ics</h3>
              <p className="text-sm text-gray-400 mt-1">Import into Google Calendar, Apple Calendar, Outlook, or any calendar app.</p>
            </button>
            <button onClick={exportPDF} className="bg-white rounded-xl border border-blue-100 p-6 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-left group text-2xl">
              <FileText className="w-8 h-8 text-rose-500 mb-3 group-hover:scale-110 transition-transform" />
              <h3 className="font-semibold text-gray-900">Export as PDF</h3>
              <p className="text-sm text-gray-400 mt-1">Download a printable weekly calendar of your study plan, color-coded by course.</p>
            </button>
            



            
          </div>

          {/* Archive */}
          









          

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