import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '../../supabase';
import TeacherLayout from '../../components/layout/TeacherLayout';
import {
  ChevronRight, BookOpen, Globe, Save, Send, Check,
  X, Plus, Award, Settings2, Image, Type, BarChart2
} from 'lucide-react';
import { toast } from 'sonner';

const GRADIENTS = [
  { label: 'Indigo', value: 'from-indigo-500 to-violet-600' },
  { label: 'Violet', value: 'from-violet-500 to-purple-600' },
  { label: 'Blue', value: 'from-blue-500 to-indigo-600' },
  { label: 'Emerald', value: 'from-emerald-500 to-teal-600' },
  { label: 'Rose', value: 'from-rose-500 to-pink-600' },
  { label: 'Amber', value: 'from-amber-500 to-orange-600' },
  { label: 'Cyan', value: 'from-cyan-500 to-blue-600' },
  { label: 'Fuchsia', value: 'from-fuchsia-500 to-violet-600' },
];

const LANGUAGES = ['English', 'Albanian', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Arabic', 'Chinese'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All Levels'];
const CATEGORIES = ['Mathematics', 'Science', 'Programming', 'Language Arts', 'History', 'Arts', 'Music', 'Physical Education', 'Other'];

const TABS = [
  { id: 'basic', label: 'Basic Info', icon: Type },
  { id: 'details', label: 'Details', icon: BarChart2 },
  { id: 'appearance', label: 'Appearance', icon: Image },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

const initialForm = {
  name: '', description: '', short_description: '',
  language: 'English', level: 'All Levels', category: 'Other',
  price: 0, is_free: true, status: 'draft' as 'draft' | 'published',
  certificate_enabled: false, gradient: 'from-violet-500 to-purple-600',
  tags: [] as string[],
};

export default function TeacherCourseForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [tagInput, setTagInput] = useState('');

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!isEditing) return;
    const fetchCourse = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase.from('courses').select('*').eq('id', id).eq('teacher_id', session.user.id).single();
      if (error) { toast.error('Course not found'); navigate('/teacher/courses'); return; }
      setForm({
        name: data.name || data.title || '',
        description: data.description || '',
        short_description: data.short_description || '',
        language: data.language || 'English',
        level: data.level || 'All Levels',
        category: data.category || 'Other',
        price: data.price || 0,
        is_free: data.is_free ?? true,
        status: data.status || 'draft',
        certificate_enabled: data.certificate_enabled || false,
        gradient: data.gradient || 'from-violet-500 to-purple-600',
        tags: data.tags || [],
      });
      setLoading(false);
    };
    fetchCourse();
  }, [id]);

  const handleSave = async (publishNow = false) => {
    if (!form.name.trim()) { toast.error('Course title is required'); setActiveTab('basic'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const payload = {
        title: form.name,
        description: form.description, short_description: form.short_description,
        language: form.language, level: form.level, category: form.category,
        price: form.is_free ? 0 : form.price, is_free: form.is_free,
        status: publishNow ? 'published' : form.status,
        certificate_enabled: form.certificate_enabled,
        gradient: form.gradient,
        updated_at: new Date().toISOString(),
      };

      if (isEditing) {
        const res = await fetch(`/api/admin/update-course/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to update course');
        toast.success(publishNow ? 'Course published!' : 'Course saved');
      } else {
        const res = await fetch('/api/admin/create-course', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, teacher_id: session.user.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create course');
        toast.success(publishNow ? 'Course created & published!' : 'Course saved as draft');
      }
      navigate('/teacher/courses');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save course');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) { set('tags', [...form.tags, tag]); setTagInput(''); }
  };

  if (loading) {
    return <TeacherLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-600" /></div></TeacherLayout>;
  }

  return (
    <TeacherLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm">
          <Link to="/teacher/courses" className="text-slate-400 hover:text-slate-600 transition-colors">My Courses</Link>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <span className="text-slate-900 font-semibold">{isEditing ? 'Edit Course' : 'New Course'}</span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left – Form */}
          <div className="xl:col-span-2 space-y-5">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />
              <div className="p-5">
                <h1 className="text-xl font-bold text-slate-900">{isEditing ? 'Edit Course' : 'Create New Course'}</h1>
                <p className="text-slate-400 text-sm mt-0.5">{isEditing ? 'Update course details and settings.' : 'Fill in the details to create your course.'}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-100 bg-slate-50/50 px-2 pt-2 gap-1">
                {TABS.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all ${
                      activeTab === tab.id
                        ? 'bg-white text-violet-600 shadow-sm border border-slate-100 border-b-white -mb-px'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                    }`}>
                    <tab.icon className="w-4 h-4" />
                    <span className="hidden sm:block">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="p-6">
                {activeTab === 'basic' && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Course Title <span className="text-red-400">*</span></label>
                      <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all font-medium"
                        placeholder="e.g. Introduction to Algebra" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Short Description</label>
                      <input type="text" value={form.short_description} onChange={e => set('short_description', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                        placeholder="A brief one-line summary" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Description</label>
                      <textarea rows={5} value={form.description} onChange={e => set('description', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all resize-none leading-relaxed"
                        placeholder="Describe what students will learn, prerequisites, and outcomes..." />
                    </div>
                  </div>
                )}

                {activeTab === 'details' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Language</label>
                        <select value={form.language} onChange={e => set('language', e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all">
                          {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Level</label>
                        <select value={form.level} onChange={e => set('level', e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all">
                          {LEVELS.map(l => <option key={l}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                      <select value={form.category} onChange={e => set('category', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all">
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Pricing</label>
                      <div className="flex gap-4 mb-4">
                        {[true, false].map(isFree => (
                          <button key={String(isFree)} type="button" onClick={() => set('is_free', isFree)}
                            className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${form.is_free === isFree ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                            {isFree ? 'Free Course' : 'Paid Course'}
                          </button>
                        ))}
                      </div>
                      {!form.is_free && (
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
                          <input type="number" min={0} step={0.01} value={form.price} onChange={e => set('price', parseFloat(e.target.value) || 0)}
                            className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all" placeholder="29.99" />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tags</label>
                      <div className="flex gap-2 mb-3">
                        <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                          placeholder="Add tag and press Enter" />
                        <button type="button" onClick={addTag} className="px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-all"><Plus className="w-4 h-4" /></button>
                      </div>
                      {form.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {form.tags.map(tag => (
                            <span key={tag} className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-violet-100">
                              {tag}
                              <button onClick={() => set('tags', form.tags.filter(t => t !== tag))} className="text-violet-400 hover:text-violet-600"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'appearance' && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Course Color Theme</label>
                      <div className="grid grid-cols-4 gap-3">
                        {GRADIENTS.map(g => (
                          <button key={g.value} type="button" onClick={() => set('gradient', g.value)}
                            className={`relative h-16 rounded-xl bg-gradient-to-br ${g.value} transition-all hover:scale-105 ${form.gradient === g.value ? 'ring-2 ring-offset-2 ring-violet-500 scale-105' : ''}`}>
                            {form.gradient === g.value && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-6 h-6 bg-white/30 rounded-full flex items-center justify-center">
                                  <Check className="w-4 h-4 text-white" />
                                </div>
                              </div>
                            )}
                            <span className="absolute bottom-1.5 left-0 right-0 text-center text-[9px] font-bold text-white/80 uppercase tracking-wider">{g.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 mb-2 font-medium">Preview</p>
                      <div className={`h-24 rounded-xl bg-gradient-to-br ${form.gradient} flex items-center justify-center`}>
                        <BookOpen className="w-8 h-8 text-white opacity-80" />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'settings' && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Status</label>
                      <div className="flex gap-4">
                        {(['draft', 'published'] as const).map(s => (
                          <button key={s} type="button" onClick={() => set('status', s)}
                            className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all capitalize ${form.status === s ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                            {s === 'published' ? '🟢 ' : '🟡 '}{s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div onClick={() => set('certificate_enabled', !form.certificate_enabled)}
                      className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${form.certificate_enabled ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center gap-3">
                        <Award className={`w-5 h-5 ${form.certificate_enabled ? 'text-violet-600' : 'text-slate-400'}`} />
                        <div>
                          <div className={`text-sm font-semibold ${form.certificate_enabled ? 'text-violet-700' : 'text-slate-700'}`}>Enable Certificate</div>
                          <div className="text-xs text-slate-400 mt-0.5">Students receive a certificate on completion</div>
                        </div>
                      </div>
                      <div className={`w-11 h-6 rounded-full transition-all ${form.certificate_enabled ? 'bg-violet-600' : 'bg-slate-200'}`}>
                        <div className="w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-all" style={{marginLeft: form.certificate_enabled ? '22px' : '2px'}} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/teacher/courses" className="flex-1 px-5 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all text-center">Cancel</Link>
              <button type="button" disabled={saving} onClick={() => handleSave(false)}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all disabled:opacity-50">
                <Save className="w-4 h-4" />Save Draft
              </button>
              <button type="button" disabled={saving} onClick={() => handleSave(true)}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all disabled:opacity-50 shadow-lg shadow-violet-200 active:scale-[0.98]">
                <Send className="w-4 h-4" />{saving ? 'Saving...' : 'Publish Course'}
              </button>
            </div>
          </div>

          {/* Right – Live Preview */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden sticky top-20">
              <div className="p-5 border-b border-slate-50">
                <h3 className="text-sm font-bold text-slate-700">Live Preview</h3>
                <p className="text-xs text-slate-400 mt-0.5">How your course will appear</p>
              </div>
              <div className="p-5">
                <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  <div className={`h-32 bg-gradient-to-br ${form.gradient} p-4 flex flex-col justify-between`}>
                    <div className="flex items-start justify-between">
                      <div className="p-2 bg-white/20 rounded-lg"><BookOpen className="w-4 h-4 text-white" /></div>
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md ${form.status === 'published' ? 'bg-emerald-500/30 text-white' : 'bg-white/20 text-white'}`}>{form.status}</span>
                    </div>
                    {form.level !== 'All Levels' && <span className="text-[9px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-md w-fit">{form.level}</span>}
                  </div>
                  <div className="p-4 bg-white">
                    <h4 className="font-bold text-slate-900 text-sm line-clamp-1">{form.name || 'Course Title'}</h4>
                    <p className="text-slate-400 text-xs mt-1 line-clamp-2 leading-relaxed">{form.short_description || form.description || 'Description here...'}</p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-400 pt-3 border-t border-slate-50">
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{form.language}</span>
                      {form.is_free ? <span className="text-emerald-600 font-semibold">Free</span> : <span className="text-violet-600 font-semibold">${form.price}</span>}
                    </div>
                  </div>
                </div>
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {form.tags.map(tag => <span key={tag} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium">{tag}</span>)}
                  </div>
                )}
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg font-medium mt-3 ${form.certificate_enabled ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-400'}`}>
                  <Award className="w-3.5 h-3.5" />{form.certificate_enabled ? 'Certificate included' : 'No certificate'}
                </div>
              </div>
            </div>
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5">
              <h4 className="text-sm font-bold text-violet-800 mb-3">Tips for success</h4>
              <ul className="space-y-2 text-xs text-violet-700">
                {['Write a clear, outcome-focused title', 'Use the short description to capture attention', 'Add tags to help students find your course', 'Enable certificates to motivate completion'].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2"><Check className="w-3.5 h-3.5 mt-0.5 text-violet-500 shrink-0" />{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
