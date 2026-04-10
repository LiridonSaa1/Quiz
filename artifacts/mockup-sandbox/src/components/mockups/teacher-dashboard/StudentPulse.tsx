import React, { useState } from 'react';
import { 
  Search, 
  Bell, 
  Settings, 
  Plus, 
  MoreVertical,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  BookOpen,
  Users,
  BarChart3,
  MessageSquare
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

type Status = 'at-risk' | 'behind' | 'on-track' | 'inactive';

interface Student {
  id: string;
  name: string;
  initials: string;
  status: Status;
  module: string;
  completion: number;
  lastSeen: string;
  grade: string;
  trend: 'up' | 'down' | 'flat';
}

const mockStudents: Student[] = [
  // At Risk
  { id: '1', name: 'Marcus Johnson', initials: 'MJ', status: 'at-risk', module: 'Module 3: Advanced CSS', completion: 24, lastSeen: '4 days ago', grade: 'D+', trend: 'down' },
  { id: '2', name: 'Sarah Chen', initials: 'SC', status: 'at-risk', module: 'Module 2: Layouts', completion: 15, lastSeen: '6 days ago', grade: 'C-', trend: 'down' },
  { id: '3', name: 'Deandre Washington', initials: 'DW', status: 'at-risk', module: 'Module 2: Layouts', completion: 18, lastSeen: '5 days ago', grade: 'D', trend: 'flat' },
  
  // Behind
  { id: '4', name: 'Emma Wilson', initials: 'EW', status: 'behind', module: 'Module 4: JavaScript Basics', completion: 45, lastSeen: '2 days ago', grade: 'B-', trend: 'down' },
  { id: '5', name: 'Liam Garcia', initials: 'LG', status: 'behind', module: 'Module 4: JavaScript Basics', completion: 42, lastSeen: 'Yesterday', grade: 'C+', trend: 'up' },
  { id: '6', name: 'Olivia Martinez', initials: 'OM', status: 'behind', module: 'Module 3: Advanced CSS', completion: 38, lastSeen: '3 days ago', grade: 'C', trend: 'flat' },
  { id: '7', name: 'Noah Rodriguez', initials: 'NR', status: 'behind', module: 'Module 3: Advanced CSS', completion: 40, lastSeen: '2 days ago', grade: 'B-', trend: 'down' },
  
  // On Track
  { id: '8', name: 'Ava Patel', initials: 'AP', status: 'on-track', module: 'Module 5: React Intro', completion: 78, lastSeen: 'Today', grade: 'A', trend: 'up' },
  { id: '9', name: 'Ethan Kim', initials: 'EK', status: 'on-track', module: 'Module 5: React Intro', completion: 75, lastSeen: 'Today', grade: 'A-', trend: 'up' },
  { id: '10', name: 'Isabella Smith', initials: 'IS', status: 'on-track', module: 'Module 4: JavaScript Basics', completion: 68, lastSeen: 'Yesterday', grade: 'B+', trend: 'up' },
  { id: '11', name: 'Mason Nguyen', initials: 'MN', status: 'on-track', module: 'Module 5: React Intro', completion: 82, lastSeen: 'Today', grade: 'A', trend: 'flat' },
  { id: '12', name: 'Mia Thompson', initials: 'MT', status: 'on-track', module: 'Module 4: JavaScript Basics', completion: 65, lastSeen: 'Yesterday', grade: 'B', trend: 'up' },
  { id: '13', name: 'Lucas Wright', initials: 'LW', status: 'on-track', module: 'Module 5: React Intro', completion: 72, lastSeen: 'Today', grade: 'B+', trend: 'up' },
  { id: '14', name: 'Charlotte Lee', initials: 'CL', status: 'on-track', module: 'Module 6: Hooks', completion: 88, lastSeen: 'Today', grade: 'A+', trend: 'up' },
  { id: '15', name: 'Amelia Harris', initials: 'AH', status: 'on-track', module: 'Module 4: JavaScript Basics', completion: 60, lastSeen: 'Yesterday', grade: 'B', trend: 'flat' },
  
  // Inactive
  { id: '16', name: 'James Brown', initials: 'JB', status: 'inactive', module: 'Module 1: HTML', completion: 5, lastSeen: '2 weeks ago', grade: 'F', trend: 'flat' },
  { id: '17', name: 'Sophia Davis', initials: 'SD', status: 'inactive', module: 'Module 1: HTML', completion: 12, lastSeen: '10 days ago', grade: 'F', trend: 'down' },
];

const StatusIcon = ({ status }: { status: Status }) => {
  switch (status) {
    case 'at-risk': return <AlertCircle className="w-4 h-4 text-red-500" />;
    case 'behind': return <Clock className="w-4 h-4 text-orange-500" />;
    case 'on-track': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'inactive': return <XCircle className="w-4 h-4 text-slate-400" />;
  }
};

const StatusBadge = ({ status }: { status: Status }) => {
  switch (status) {
    case 'at-risk': 
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1"><AlertCircle className="w-3 h-3" /> At Risk</Badge>;
    case 'behind': 
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1"><Clock className="w-3 h-3" /> Falling Behind</Badge>;
    case 'on-track': 
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="w-3 h-3" /> On Track</Badge>;
    case 'inactive': 
      return <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 gap-1"><XCircle className="w-3 h-3" /> Inactive</Badge>;
  }
};

const getStatusColor = (status: Status) => {
  switch (status) {
    case 'at-risk': return 'border-l-red-500';
    case 'behind': return 'border-l-orange-500';
    case 'on-track': return 'border-l-emerald-500';
    case 'inactive': return 'border-l-slate-400';
  }
};

export function StudentPulse() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | Status>('all');

  const filteredStudents = mockStudents.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          s.module.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = activeTab === 'all' || s.status === activeTab;
    return matchesSearch && matchesStatus;
  });

  const atRiskCount = mockStudents.filter(s => s.status === 'at-risk').length;
  const behindCount = mockStudents.filter(s => s.status === 'behind').length;
  const onTrackCount = mockStudents.filter(s => s.status === 'on-track').length;
  const inactiveCount = mockStudents.filter(s => s.status === 'inactive').length;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold text-xl">
              Q
            </div>
            <span className="font-semibold text-lg tracking-tight">QuizMaster</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            <Button variant="ghost" className="text-slate-600 hover:text-violet-700 hover:bg-violet-50">Courses</Button>
            <Button variant="ghost" className="bg-violet-50 text-violet-700">Students</Button>
            <Button variant="ghost" className="text-slate-600 hover:text-violet-700 hover:bg-violet-50">Reports</Button>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden md:block w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search students..." 
              className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-violet-500 rounded-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="ghost" size="icon" className="text-slate-500 rounded-full">
            <Bell className="h-5 w-5" />
          </Button>
          <Avatar className="h-9 w-9 border-2 border-white shadow-sm cursor-pointer ring-2 ring-transparent hover:ring-violet-200 transition-all">
            <AvatarImage src="https://i.pravatar.cc/150?u=teacher" />
            <AvatarFallback className="bg-violet-100 text-violet-700 font-medium">T</AvatarFallback>
          </Avatar>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col gap-8">
        {/* Dashboard Header & Summary */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Student Pulse</h1>
            <p className="text-slate-500 mt-1 text-lg">Web Development Bootcamp • Spring 2024</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2 border-slate-200 shadow-sm">
              <MessageSquare className="w-4 h-4" /> Message Class
            </Button>
            <Button className="gap-2 bg-violet-600 hover:bg-violet-700 shadow-sm">
              <Plus className="w-4 h-4" /> Add Student
            </Button>
          </div>
        </div>

        {/* Pulse Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card 
            className={`cursor-pointer transition-all border-l-4 border-l-emerald-500 ${activeTab === 'on-track' ? 'ring-2 ring-emerald-500 bg-emerald-50/50' : 'hover:border-slate-300'}`}
            onClick={() => setActiveTab(activeTab === 'on-track' ? 'all' : 'on-track')}
          >
            <CardContent className="p-4 md:p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> On Track</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{onTrackCount}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all border-l-4 border-l-orange-500 ${activeTab === 'behind' ? 'ring-2 ring-orange-500 bg-orange-50/50' : 'hover:border-slate-300'}`}
            onClick={() => setActiveTab(activeTab === 'behind' ? 'all' : 'behind')}
          >
            <CardContent className="p-4 md:p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5"><Clock className="w-4 h-4 text-orange-500" /> Falling Behind</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{behindCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all border-l-4 border-l-red-500 ${activeTab === 'at-risk' ? 'ring-2 ring-red-500 bg-red-50/50' : 'hover:border-slate-300'}`}
            onClick={() => setActiveTab(activeTab === 'at-risk' ? 'all' : 'at-risk')}
          >
            <CardContent className="p-4 md:p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-red-500" /> At Risk</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{atRiskCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all border-l-4 border-l-slate-400 ${activeTab === 'inactive' ? 'ring-2 ring-slate-400 bg-slate-100/50' : 'hover:border-slate-300'}`}
            onClick={() => setActiveTab(activeTab === 'inactive' ? 'all' : 'inactive')}
          >
            <CardContent className="p-4 md:p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 flex items-center gap-1.5"><XCircle className="w-4 h-4 text-slate-400" /> Inactive</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{inactiveCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 py-2 border-b border-slate-200">
          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            <Button 
              variant={activeTab === 'all' ? "default" : "ghost"} 
              size="sm" 
              className={activeTab === 'all' ? "bg-slate-800 hover:bg-slate-700" : "text-slate-500"}
              onClick={() => setActiveTab('all')}
            >
              All Students ({mockStudents.length})
            </Button>
            <Button 
              variant={activeTab === 'at-risk' ? "default" : "ghost"} 
              size="sm"
              className={activeTab === 'at-risk' ? "bg-red-100 text-red-800 hover:bg-red-200" : "text-slate-500 hover:text-red-700 hover:bg-red-50"}
              onClick={() => setActiveTab('at-risk')}
            >
              At Risk
            </Button>
            <Button 
              variant={activeTab === 'behind' ? "default" : "ghost"} 
              size="sm"
              className={activeTab === 'behind' ? "bg-orange-100 text-orange-800 hover:bg-orange-200" : "text-slate-500 hover:text-orange-700 hover:bg-orange-50"}
              onClick={() => setActiveTab('behind')}
            >
              Behind
            </Button>
            <Button 
              variant={activeTab === 'on-track' ? "default" : "ghost"} 
              size="sm"
              className={activeTab === 'on-track' ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"}
              onClick={() => setActiveTab('on-track')}
            >
              On Track
            </Button>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" size="sm" className="w-full sm:w-auto text-slate-600">
              <BarChart3 className="w-4 h-4 mr-2" /> Sort: Priority
            </Button>
          </div>
        </div>

        {/* Students Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredStudents.map(student => (
            <Card key={student.id} className={`overflow-hidden border-l-4 ${getStatusColor(student.status)} hover:shadow-md transition-shadow cursor-pointer bg-white group`}>
              <CardContent className="p-0">
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-3 items-center">
                      <Avatar className="h-12 w-12 border border-slate-100 shadow-sm group-hover:scale-105 transition-transform">
                        <AvatarImage src={`https://api.dicebear.com/7.x/notionists/svg?seed=${student.initials}&backgroundColor=f1f5f9`} />
                        <AvatarFallback className="bg-slate-100 text-slate-600">{student.initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold text-slate-900 leading-none mb-1.5 group-hover:text-violet-700 transition-colors">{student.name}</h3>
                        <StatusBadge status={student.status} />
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 -mr-2 -mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-500 font-medium truncate pr-2" title={student.module}>{student.module}</span>
                        <span className="text-slate-700 font-semibold">{student.completion}%</span>
                      </div>
                      <Progress value={student.completion} className="h-2 bg-slate-100" />
                    </div>
                    
                    <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                          <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Grade</span>
                          <span className="font-semibold text-slate-700">{student.grade}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Last Seen</span>
                          <span className="text-slate-600">{student.lastSeen}</span>
                        </div>
                      </div>
                      
                      <Button variant="ghost" size="sm" className="h-7 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 px-2.5">
                        Details
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {filteredStudents.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-white rounded-xl border border-dashed border-slate-300">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">No students found</h3>
              <p className="text-slate-500 max-w-sm mt-1">We couldn't find any students matching your current filters and search query.</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  setSearchQuery('');
                  setActiveTab('all');
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
