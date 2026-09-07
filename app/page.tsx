'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2,
  ChevronDown, CirclePlus, Clock3, Focus, Inbox, LayoutGrid, ListTodo,
  LoaderCircle, LogOut, MoreHorizontal, PanelLeftClose, Plus, RefreshCw,
  Search, Settings, Sparkles, SunMedium, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useGoogleWorkspace } from '@/hooks/use-google-workspace';

type Task = {
  id: string;
  title: string;
  project: string;
  duration: number;
  priority: 'High' | 'Medium' | 'Low';
  completed?: boolean;
  scheduled?: string;
  source?: 'local' | 'google';
  googleListId?: string;
};

type View = 'today' | 'inbox' | 'upcoming' | 'all' | 'work' | 'learn' | 'music' | 'travel';

const viewTitles: Record<View, string> = {
  today: 'Today', inbox: 'Inbox', upcoming: 'Upcoming', all: 'All tasks',
  work: 'Work', learn: 'Learn', music: 'Music', travel: 'Travel',
};

const initialTasks: Task[] = [
  { id: 'sample-1', title: 'Finish CDC pipeline', project: 'Work', duration: 90, priority: 'High', scheduled: '10:00', source: 'local' },
  { id: 'sample-2', title: 'Kubernetes chapter 3', project: 'Learn', duration: 45, priority: 'Medium', source: 'local' },
  { id: 'sample-3', title: 'Practice On My Own', project: 'Music', duration: 30, priority: 'Medium', source: 'local' },
  { id: 'sample-4', title: 'Book Serbia hotel', project: 'Travel', duration: 20, priority: 'Low', source: 'local' },
  { id: 'sample-5', title: 'Reply to design notes', project: 'Work', duration: 25, priority: 'Low', completed: true, source: 'local' },
];

const projectStyle: Record<string, string> = {
  Work: 'bg-[#e8efff] text-[#4c65a8]', Learn: 'bg-[#eee9ff] text-[#6e5aa7]',
  Music: 'bg-[#ffeadf] text-[#a65f3b]', Travel: 'bg-[#dff3e9] text-[#397962]',
  Personal: 'bg-[#fff0c9] text-[#8a6b17]', 'Google Tasks': 'bg-[#e5f0ff] text-[#3c67a3]',
};
const hourRows = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'];

function GoogleMark() {
  return <span className="google-mark" aria-hidden="true"><span>G</span></span>;
}

function sampleCalendarEvents() {
  const at = (hour: number, minutes = 0) => {
    const value = new Date();
    value.setHours(hour, minutes, 0, 0);
    return value;
  };
  return [
    { id: 'event-1', title: 'Team standup', start: at(9), end: at(10), allDay: false, location: 'Google Meet' },
    { id: 'event-2', title: 'Finish CDC pipeline', start: at(10), end: at(11, 30), allDay: false, location: 'Focus block' },
    { id: 'event-3', title: 'Lunch', start: at(12), end: at(13), allDay: false, location: 'Home' },
    { id: 'event-4', title: 'Product review', start: at(15), end: at(16), allDay: false, location: 'Studio room' },
  ];
}

export default function Home() {
  const google = useGoogleWorkspace();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [filter, setFilter] = useState<'All' | 'Open' | 'Done'>('All');
  const [addOpen, setAddOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<View>('today');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [sortByPriority, setSortByPriority] = useState(true);
  const [planned, setPlanned] = useState(false);
  const [toast, setToast] = useState('');
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (google.status !== 'connected') return;
    setTasks(google.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      project: 'Google Tasks',
      duration: 30,
      priority: 'Medium',
      completed: task.completed,
      source: 'google',
      googleListId: task.listId,
    })));
  }, [google.status, google.tasks]);

  const selectedDate = useMemo(() => {
    if (!now) return null;
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    return date;
  }, [dayOffset, now]);
  const calendarEvents = dayOffset === 0 ? (google.status === 'connected' ? google.events : sampleCalendarEvents()) : [];
  const timedEvents = calendarEvents.filter((event) => !event.allDay && event.end.getHours() >= 8 && event.start.getHours() < 18);
  const allDayEvents = calendarEvents.filter((event) => event.allDay);
  const openTasks = tasks.filter((task) => !task.completed);
  const totalMinutes = openTasks.reduce((sum, task) => sum + task.duration, 0);
  const filteredTasks = useMemo(() => {
    const priorityRank = { High: 0, Medium: 1, Low: 2 };
    return tasks
      .filter((task) => {
        if (filter !== 'All' && (filter === 'Done') !== Boolean(task.completed)) return false;
        if (activeView === 'upcoming' && !task.scheduled) return false;
        if (['work', 'learn', 'music', 'travel'].includes(activeView) && task.project.toLowerCase() !== activeView) return false;
        return true;
      })
      .sort((a, b) => sortByPriority
        ? priorityRank[a.priority] - priorityRank[b.priority]
        : a.title.localeCompare(b.title));
  }, [activeView, filter, sortByPriority, tasks]);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? tasks.filter((task) => `${task.title} ${task.project}`.toLowerCase().includes(query)) : tasks.slice(0, 5);
  }, [searchQuery, tasks]);
  const displayName = google.account?.name?.split(' ')[0] || 'Jueying';
  const eyebrowDate = selectedDate ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(selectedDate).toUpperCase() : 'TODAY';

  const flash = (message: string, duration = 2600) => {
    setToast(message);
    window.setTimeout(() => setToast(''), duration);
  };

  const navigate = (view: View) => {
    setActiveView(view);
    setFilter(view === 'upcoming' ? 'Open' : 'All');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const completed = !task.completed;
    setTasks((current) => current.map((item) => item.id === id ? { ...item, completed } : item));
    if (task.source === 'google' && task.googleListId) {
      try {
        await google.setTaskCompleted({ id: task.id, listId: task.googleListId, title: task.title, completed: Boolean(task.completed) }, completed);
        flash(completed ? 'Completed in Google Tasks' : 'Reopened in Google Tasks');
      } catch (reason) {
        setTasks((current) => current.map((item) => item.id === id ? { ...item, completed: task.completed } : item));
        flash(reason instanceof Error ? reason.message : 'Could not update Google Tasks');
      }
    }
  };

  const scheduleTask = async (id: string, slot = '2:00') => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    setTasks((current) => current.map((item) => item.id === id ? { ...item, scheduled: item.scheduled || slot } : item));
    if (google.status === 'connected') {
      const [hourText, minuteText] = slot.split(':');
      const start = new Date();
      let hour = Number(hourText);
      if (hour < 8) hour += 12;
      start.setHours(hour, Number(minuteText), 0, 0);
      try {
        await google.createCalendarBlock(task.title, start, task.duration);
        flash('Focus block created in Google Calendar');
      } catch (reason) {
        flash(reason instanceof Error ? reason.message : 'Could not create calendar event');
      }
    } else flash('Task scheduled for 2:00 PM');
  };

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') || '').trim();
    if (!title) return;
    const optimisticId = `local-${Date.now()}`;
    const draft: Task = {
      id: optimisticId,
      title,
      project: google.status === 'connected' ? 'Google Tasks' : String(data.get('project') || 'Personal'),
      duration: Number(data.get('duration') || 30),
      priority: 'Medium',
      source: 'local',
    };
    setTasks((current) => [...current, draft]);
    setAddOpen(false);
    if (google.status === 'connected') {
      try {
        const created = await google.createTask(title);
        setTasks((current) => current.map((item) => item.id === optimisticId ? { ...item, id: created.id, googleListId: created.listId, source: 'google' } : item));
        flash('Task added to Google Tasks');
      } catch (reason) {
        flash(reason instanceof Error ? reason.message : 'Saved locally; Google sync failed');
      }
    } else flash('Task added locally');
  };

  const planDay = async () => {
    const slots = ['1:00', '2:00', '4:00', '4:30'];
    const candidates = tasks.filter((task) => !task.completed && !task.scheduled).slice(0, slots.length);
    setTasks((current) => current.map((task) => {
      const index = candidates.findIndex((candidate) => candidate.id === task.id);
      return index >= 0 ? { ...task, scheduled: slots[index] } : task;
    }));
    setPlanned(true);
    if (google.status === 'connected') {
      await Promise.allSettled(candidates.map((task, index) => {
        const [hourText, minuteText] = slots[index].split(':');
        const start = new Date();
        let hour = Number(hourText);
        if (hour < 8) hour += 12;
        start.setHours(hour, Number(minuteText), 0, 0);
        return google.createCalendarBlock(task.title, start, task.duration);
      }));
      flash(`${candidates.length} focus blocks added to Google Calendar`, 3200);
    } else flash('Your day has been balanced around your calendar', 3200);
  };

  const eventPosition = (start: Date, end: Date) => {
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    return { top: Math.max(0, ((startMinutes - 8 * 60) / 60) * 54), height: Math.max(32, ((endMinutes - startMinutes) / 60) * 54) };
  };

  return (
    <main className={`app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><Check size={15} strokeWidth={3} /></div><span className="brand-name">Daybridge</span><button className="icon-button sidebar-collapse" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed((value) => !value)}><PanelLeftClose size={17} /></button></div>
        <button className="search-button" onClick={() => setSearchOpen(true)}><Search size={16} /><span>Search</span><kbd>⌘ K</kbd></button>
        <nav className="nav-list" aria-label="Main navigation">
          <button aria-label="Today" className={`nav-item ${activeView === 'today' ? 'active' : ''}`} onClick={() => navigate('today')}><SunMedium size={17} /><span>Today</span><span className="nav-count">{openTasks.length}</span></button>
          <button aria-label="Inbox" className={`nav-item ${activeView === 'inbox' ? 'active' : ''}`} onClick={() => navigate('inbox')}><Inbox size={17} /><span>Inbox</span><span className="nav-count">{tasks.length}</span></button>
          <button aria-label="Upcoming" className={`nav-item ${activeView === 'upcoming' ? 'active' : ''}`} onClick={() => navigate('upcoming')}><CalendarDays size={17} /><span>Upcoming</span></button>
          <button aria-label="All tasks" className={`nav-item ${activeView === 'all' ? 'active' : ''}`} onClick={() => navigate('all')}><ListTodo size={17} /><span>All tasks</span></button>
        </nav>
        <div className="sidebar-section">
          <div className="section-label"><span>Projects</span><Plus size={14} /></div>
          {(['work', 'learn', 'music', 'travel'] as const).map((project) => <button aria-label={viewTitles[project]} key={project} className={`nav-item ${activeView === project ? 'active' : ''}`} onClick={() => navigate(project)}><span className={`project-dot ${project === 'work' ? 'blue' : project === 'learn' ? 'purple' : project === 'music' ? 'orange' : 'green'}`} /><span>{viewTitles[project]}</span><span className="nav-count">{tasks.filter((task) => task.project.toLowerCase() === project).length}</span></button>)}
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item connect-row" onClick={() => setConnectOpen(true)}><GoogleMark /><span>{google.status === 'connected' ? 'Google connected' : 'Connect Google'}</span></button>
          <button className="nav-item" onClick={() => setSettingsOpen(true)}><Settings size={17} /><span>Settings</span></button>
          <div className="profile"><div className="avatar">{displayName.slice(0, 2).toUpperCase()}</div><div><strong>{displayName}</strong><span>{google.account?.email || 'Personal workspace'}</span></div><MoreHorizontal size={17} /></div>
        </div>
      </aside>

      <section className="workspace" id="today">
        <header className="topbar">
          <div className="date-nav"><Button variant="ghost" size="icon-sm" aria-label="Previous day" onClick={() => setDayOffset((value) => value - 1)}><ArrowLeft /></Button><button className="date-button" onClick={() => setDayOffset(0)}>{dayOffset === 0 ? 'Today' : selectedDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(selectedDate) : 'Today'} <ChevronDown size={14} /></button><Button variant="ghost" size="icon-sm" aria-label="Next day" onClick={() => setDayOffset((value) => value + 1)}><ArrowRight /></Button></div>
          <div className="top-actions">
            <span className={`sync-status ${google.status === 'connected' ? 'connected' : ''}`}><span /> {google.status === 'connected' ? 'Synced with Google' : 'Local mode'}</span>
            <Button variant="outline" className="google-button" onClick={() => setConnectOpen(true)}><GoogleMark /> {google.status === 'connected' ? google.account?.email : 'Connect Google'}</Button>
            {google.account?.picture ? <img className="mini-avatar account-photo" src={google.account.picture} alt={google.account.name} referrerPolicy="no-referrer" /> : <div className="mini-avatar">{displayName.slice(0, 2).toUpperCase()}</div>}
          </div>
        </header>

        <div className="content-grid">
          <section className="tasks-panel">
            <div className="day-heading">
              <div><p className="eyebrow">{eyebrowDate}</p><h1>{activeView === 'today' ? <>Good morning, {displayName} <span>☀</span></> : viewTitles[activeView]}</h1><p>Showing <strong>{filteredTasks.length} tasks</strong> and <strong>{calendarEvents.length} events</strong>.</p></div>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger render={<Button className="add-task-button" />}><Plus /> Add task</DialogTrigger>
                <DialogContent className="task-dialog"><DialogHeader><DialogTitle>Add a task</DialogTitle><DialogDescription>{google.status === 'connected' ? 'This will be added to Google Tasks.' : 'Capture it now. Connect Google to sync it.'}</DialogDescription></DialogHeader>
                  <form id="add-task-form" onSubmit={addTask} className="task-form"><label>Task name<Input name="title" autoFocus placeholder="What needs to get done?" /></label><div className="form-grid"><label>Project<select name="project" defaultValue="Personal" disabled={google.status === 'connected'}><option>{google.status === 'connected' ? 'Google Tasks' : 'Personal'}</option><option>Work</option><option>Learn</option><option>Music</option><option>Travel</option></select></label><label>Estimate<select name="duration" defaultValue="30"><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 hour</option><option value="90">1.5 hours</option></select></label></div></form>
                  <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button type="submit" form="add-task-form">Add task</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="capacity-card"><div className="capacity-icon"><Focus size={19} /></div><div className="capacity-copy"><div><strong>Today’s capacity</strong><span>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m of tasks · 4h 20m free</span></div><div className="capacity-track"><span style={{ width: `${Math.min(100, (totalMinutes / 260) * 100)}%` }} /></div></div><span className="capacity-note">{totalMinutes > 260 ? 'A little ambitious' : 'Nicely balanced'}</span></div>
            <div className="task-toolbar"><div className="filter-tabs">{(['All', 'Open', 'Done'] as const).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><button className="sort-button" onClick={() => setSortByPriority((value) => !value)}>{sortByPriority ? 'Priority' : 'Name'} <ChevronDown size={14} /></button></div>
            <div className="task-list">
              {filteredTasks.map((task) => <article key={task.id} className={`task-row ${task.completed ? 'completed' : ''}`} draggable={!task.completed} onDragEnd={() => void scheduleTask(task.id)}><button className="task-check" onClick={() => void toggleTask(task.id)} aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}>{task.completed && <Check size={13} strokeWidth={3} />}</button><div className="task-body"><strong>{task.title}</strong><div className="task-meta"><span className={projectStyle[task.project] || projectStyle.Personal}>{task.project}</span><span><Clock3 size={12} />{task.duration < 60 ? `${task.duration}m` : `${task.duration / 60}h`}</span>{task.scheduled && <span className="scheduled"><CalendarDays size={12} />{task.scheduled}</span>}</div></div>{task.priority === 'High' && <span className="priority-dot" title="High priority" />}{!task.completed && !task.scheduled && <button className="quick-schedule" onClick={() => void scheduleTask(task.id)}>Schedule</button>}<button className="row-menu" aria-label={`More options for ${task.title}`}><MoreHorizontal size={18} /></button></article>)}
              {filteredTasks.length === 0 && <div className="empty-state"><CheckCircle2 /><strong>All clear</strong><span>{google.status === 'connected' ? 'No tasks in your first Google Tasks list.' : 'Nothing in this view.'}</span></div>}
            </div>
            <button className="inline-add" onClick={() => setAddOpen(true)}><CirclePlus size={18} /> Add another task</button>
          </section>

          <section className="calendar-panel" aria-label="Daily calendar">
            <div className="calendar-heading"><div><span>{selectedDate ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(selectedDate) : 'Today'}</span><strong>{selectedDate ? new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(selectedDate) : ''}</strong></div><div className="calendar-controls"><button className="view-select" onClick={() => flash('Day view selected')}>Day <ChevronDown size={13} /></button><Button variant="outline" size="icon-sm" aria-label="Calendar overview" onClick={() => flash('Calendar overview is ready')}><LayoutGrid /></Button></div></div>
            <div className="all-day"><span>ALL DAY</span><div className="all-day-event">{allDayEvents[0]?.title || (google.status === 'connected' ? 'No all-day events' : 'Submit travel form')}</div></div>
            <div className="timeline" onDragOver={(event) => event.preventDefault()} onDrop={() => flash('Drop complete — choose Schedule to sync the exact time')}>
              {hourRows.map((hour) => <div className="hour-row" key={hour}><span>{hour}</span><div /></div>)}
              {now && <div className="now-line" style={{ top: `${Math.max(0, Math.min(540, ((now.getHours() * 60 + now.getMinutes() - 480) / 60) * 54))}px` }}><span>{new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }).format(now)}</span><i /></div>}
              {timedEvents.map((event, index) => {
                const position = eventPosition(event.start, event.end);
                return <div key={event.id} className={`event ${index % 3 === 0 ? 'event-meeting' : index % 3 === 1 ? 'event-focus' : 'event-lunch'}`} style={position}><span>{new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(event.start)}</span><strong>{event.title}</strong><small>{event.location || `${Math.round((event.end.getTime() - event.start.getTime()) / 60000)} min`}</small></div>;
              })}
              {planned && google.status !== 'connected' && <><div className="event event-auto" style={{ top: 356, height: 45 }}><span>1:00</span><strong>Kubernetes chapter 3</strong></div><div className="event event-auto" style={{ top: 500, height: 42 }}><span>4:00</span><strong>Practice On My Own</strong></div></>}
            </div>
            <div className="plan-card"><div className="sparkle-icon"><Sparkles size={18} /></div><div><strong>{planned ? 'Your plan is ready' : 'Make the day fit'}</strong><span>{planned ? 'Focus blocks were added around your events.' : 'Fit open tasks into your real calendar gaps.'}</span></div><Button onClick={() => void planDay()} disabled={planned || openTasks.length === 0}>{planned ? <><Check /> Planned</> : 'Plan my day'}</Button></div>
          </section>
        </div>
      </section>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="connect-dialog">
          <button className="dialog-x" onClick={() => setConnectOpen(false)} aria-label="Close"><X size={18} /></button>
          <div className="connect-hero"><GoogleMark /><span className="link-line" /><div className="brand-mark"><Check size={15} strokeWidth={3} /></div></div>
          {google.status === 'connected' ? <>
            <DialogHeader><DialogTitle>Google is connected</DialogTitle><DialogDescription>Your Tasks and today’s Calendar events are live in Daybridge.</DialogDescription></DialogHeader>
            <div className="connected-account">{google.account?.picture ? <img src={google.account.picture} alt="" referrerPolicy="no-referrer" /> : <div className="avatar">{displayName.slice(0, 2).toUpperCase()}</div>}<span><strong>{google.account?.name}</strong><small>{google.account?.email}</small></span><CheckCircle2 /></div>
            <div className="sync-summary"><span><strong>{google.tasks.length}</strong> tasks synced</span><span><strong>{google.events.length}</strong> events today</span></div>
            <div className="connected-actions"><Button variant="outline" onClick={() => void google.refresh()}><RefreshCw /> Sync now</Button><Button variant="destructive" onClick={google.disconnect}><LogOut /> Disconnect</Button></div>
          </> : <>
            <DialogHeader><DialogTitle>Connect your Google day</DialogTitle><DialogDescription>Sign in once to bring Google Tasks and Calendar into one calm plan.</DialogDescription></DialogHeader>
            <div className="permission-list"><div><CalendarDays /><span><strong>Google Calendar</strong><small>View events and create focus blocks</small></span><Check className="permission-check" /></div><div><ListTodo /><span><strong>Google Tasks</strong><small>Sync, create, update, and complete tasks</small></span><Check className="permission-check" /></div></div>
            {google.status === 'unconfigured' && <p className="preview-note"><AlertCircle /> Google OAuth Client ID still needs to be added in Vercel.</p>}
            {google.error && <p className="oauth-error"><AlertCircle /> {google.error}</p>}
            <Button className="continue-google" onClick={google.connect} disabled={google.status === 'loading' || google.status === 'connecting'}>{google.status === 'loading' || google.status === 'connecting' ? <LoaderCircle className="spin" /> : <GoogleMark />} {google.status === 'connecting' ? 'Opening Google…' : 'Continue with Google'}</Button>
            <p className="privacy-copy">Access is session-only. Disconnect or revoke access anytime.</p>
          </>}
        </DialogContent>
      </Dialog>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="task-dialog search-dialog"><DialogHeader><DialogTitle>Search tasks</DialogTitle><DialogDescription>Find a task or project.</DialogDescription></DialogHeader><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} autoFocus placeholder="Search tasks…" /><div className="search-results">{searchResults.map((task) => <button key={task.id} onClick={() => { setSearchOpen(false); setSearchQuery(''); navigate('all'); flash(`Found: ${task.title}`); }}><Search size={14} /><span><strong>{task.title}</strong><small>{task.project} · {task.duration} min</small></span></button>)}{searchResults.length === 0 && <p>No matching tasks.</p>}</div></DialogContent>
      </Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="task-dialog settings-dialog"><DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>Manage your Google connection and planner preferences.</DialogDescription></DialogHeader><div className="settings-row"><span><strong>Google Workspace</strong><small>{google.status === 'connected' ? google.account?.email : 'Not connected'}</small></span><Button variant="outline" onClick={() => { setSettingsOpen(false); setConnectOpen(true); }}>{google.status === 'connected' ? 'Manage' : 'Connect'}</Button></div><div className="settings-row"><span><strong>Task ordering</strong><small>{sortByPriority ? 'Priority first' : 'Alphabetical'}</small></span><Button variant="outline" onClick={() => setSortByPriority((value) => !value)}>Change</Button></div></DialogContent>
      </Dialog>
      {toast && <div className="toast-message"><CheckCircle2 size={17} />{toast}</div>}
    </main>
  );
}
