import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '../../supabase';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  ChevronRight, BookOpen, Users, Globe, BarChart2,
  Save, Send, Check, AlertCircle, X, Plus, Trash2,
  Image, Type, AlignLeft, DollarSign, Award, Settings2
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

const initialForm = {
  name: '',
  description: '',
  short_description: '',
  language: 'English',
  level: 'All Levels',
  category: 'Other',
  price: 0,
  is_free: true,
  status: 'draft' as 'draft' | 'published',
  certificate_enabled: false,
  gradient: 'from-indigo-500 to-violet-600',
  teacher_id: '',
  tags: [] as string[],
};

const TABS = [
  { id: 'basic', label: 'Basic Info', icon: Type },
  { id: 'details', label: 'Details', icon: BarChart2 },
  { id: 'appearance', label: 'Appearance', icon: Image },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

export default function AdminCourseForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [form, setForm] = useState(initialForm);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [tagInput, setTagInput] = useState('');

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    const fetchTeachers = async () => {
      const { data } = await supabase.from('profiles').select('id, display_name, email').eq('role', 'teacher');
      setTeachers(data || []);
    };
    fetchTeachers();

    if (isEditing) {
      const fetchCourse = async () => {
        const { data, error } = await supabase.from('courses').select('*').eq('id', id).single();
        if (error) { toast.error('Course not found'); navigate('/admin/courses'); return; }
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
          gradient: data.gradient || 'from-indigo-500 to-violet-600',
          teacher_id: data.teacher_id || '',
          tags: data.tags || [],
        });
        setLoading(false);
      };
      fetchCourse();
    }
  }, [id]);

  const handleSave = async (publishNow = false) => {
    if (!form.name.trim()) { toast.error('Course title is required'); setActiveTab('basic'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        title: form.name,
        description: form.description,
        short_description: form.short_description,
        language: form.language,
        level: form.level,
        category: form.category,
        price: form.is_free ? 0 : form.price,
        is_free: form.is_free,
        status: publishNow ? 'published' : form.status,
        certificate_enabled: form.certificate_enabled,
        gradient: form.gradient,
        teacher_id: form.teacher_id || null,
        tags: form.tags,
        updated_at: new Date().toISOString(),
      };

      if (isEditing) {
        const { error } = await supabase.from('courses').update(payload).eq('id', id);
        if (error) throw error;
        toast.success(publishNow ? 'Course published!' : 'Course saved');
      } else {
        const { error } = await supabase.from('courses').insert({ ...payload, student_ids: [], created_at: new Date().toISOString() });
        if (error) throw error;
        toast.success(publishNow ? 'Course created & published!' : 'Course created as draft');
      }
      navigate('/admin/courses');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save course');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      set('tags', [...form.tags, tag]);
      setTagInput('');
    }
  };

  if (loading) {
    return <AdminLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link to="/admin/courses" className="text-slate-400 hover:text-slate-600 transition-colors">Courses</Link>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <span className="text-slate-900 font-semibold">{isEditing ? 'Edit Course' : 'New Course'}</span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left – Form */}
          <div className="xl:col-span-2 space-y-5">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
              <div className="p-5">
                <h1 className="text-xl font-bold text-slate-900">{isEditing ? 'Edit Course' : 'Create New Course'}</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {isEditing ? 'Update course details and settings.' : 'Fill in the details to create a new course.'}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex border-b border-slate-100 bg-slate-50/50 px-2 pt-2 gap-1">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-all ${
                      activeTab === tab.id
                        ? 'bg-white text-indigo-600 shadow-sm border border-slate-100 border-b-white -mb-px'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span className="hidden sm:block">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="p-6">
                {/* Basic Info Tab */}
                {activeTab === 'basic' && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Course Title <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => set('name', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium"
                        placeholder="e.g. Advanced Mathematics for Grade 10"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Short Description</label>
                      <input
                        type="text"
                        value={form.short_description}
                        onChange={e => set('short_description', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                        placeholder="A brief summary shown in course listings"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Description</label>
                      <textarea
                        rows={5}
                        value={form.description}
                        onChange={e => set('description', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none leading-relaxed"
                        placeholder="Describe what students will learn, who this course is for, and what's included..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Assign Teacher</label>
                      <select
                        value={form.teacher_id}
                        onChange={e => set('teacher_id', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      >
                        <option value="">— Select a teacher —</option>
                        {teachers.map(t => (
                          <option key={t.id} value={t.id}>{t.display_name} ({t.email})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Details Tab */}
                {activeTab === 'details' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Language</label>
                        <select value={form.language} onChange={e => set('language', e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                          {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Level</label>
                        <select value={form.level} onChange={e => set('level', e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                          {LEVELS.map(l => <option key={l}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                      <select value={form.category} onChange={e => set('category', e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Pricing</label>
                      <div className="flex items-center gap-4 mb-4">
                        <button
                          type="button"
                          onClick={() => set('is_free', true)}
                          className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${form.is_free ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                        >
                          Free Course
                        </button>
                        <button
                          type="button"
                          onClick={() => set('is_free', false)}
                          className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${!form.is_free ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                        >
                          Paid Course
                        </button>
                      </div>
                      {!form.is_free && (
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={form.price}
                            onChange={e => set('price', parseFloat(e.target.value) || 0)}
                            className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="29.99"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tags</label>
                      <div className="flex gap-2 mb-3">
                        <input
                          type="text"
                          value={tagInput}
                          onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          placeholder="Add a tag and press Enter"
                        />
                        <button type="button" onClick={addTag}
                          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {form.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {form.tags.map(tag => (
                            <span key={tag} className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-100">
                              {tag}
                              <button onClick={() => set('tags', form.tags.filter(t => t !== tag))}
                                className="text-indigo-400 hover:text-indigo-600 transition-colors">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Appearance Tab */}
                {activeTab === 'appearance' && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Course Color Theme</label>
                      <div className="grid grid-cols-4 gap-3">
                        {GRADIENTS.map(g => (
                          <button
                            key={g.value}
                            type="button"
                            onClick={() => set('gradient', g.value)}
                            className={`relative h-16 rounded-xl bg-gradient-to-br ${g.value} transition-all hover:scale-105 ${form.gradient === g.value ? 'ring-2 ring-offset-2 ring-indigo-500 scale-105' : ''}`}
                          >
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
                    <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 mb-2 font-medium">Preview</p>
                      <div className={`h-24 rounded-xl bg-gradient-to-br ${form.gradient} flex items-center justify-center`}>
                        <BookOpen className="w-8 h-8 text-white opacity-80" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Publication Status</label>
                      <div className="flex items-center gap-4">
                        {(['draft', 'published'] as const).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => set('status', s)}
                            className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all capitalize ${
                              form.status === s ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            {s === 'published' ? '🟢 ' : '🟡 '}{s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Certificate</label>
                      <div
                        onClick={() => set('certificate_enabled', !form.certificate_enabled)}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          form.certificate_enabled ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Award className={`w-5 h-5 ${form.certificate_enabled ? 'text-indigo-600' : 'text-slate-400'}`} />
                          <div>
                            <div className={`text-sm font-semibold ${form.certificate_enabled ? 'text-indigo-700' : 'text-slate-700'}`}>
                              Enable Certificate
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">Students receive a certificate upon completion</div>
                          </div>
                        </div>
                        <div className={`w-11 h-6 rounded-full transition-all ${form.certificate_enabled ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                          <div className={`w-5 h-5 bg-white rounded-full shadow mt-0.5 transition-all ${form.certificate_enabled ? 'ml-5.5' : 'ml-0.5'}`} style={{marginLeft: form.certificate_enabled ? '22px' : '2px'}} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/admin/courses"
                className="flex-1 px-5 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all text-center">
                Cancel
              </Link>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(false)}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Save Draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(true)}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-200 active:scale-[0.98]"
              >
                <Send className="w-4 h-4" />
                {saving ? 'Saving...' : 'Publish Course'}
              </button>
            </div>
          </div>

          {/* Right – Live Preview */}
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden sticky top-20">
              <div className="p-5 border-b border-slate-50">
                <h3 className="text-sm font-bold text-slate-700">Live Preview</h3>
                <p className="text-xs text-slate-400 mt-0.5">How your course card will look</p>
              </div>
              <div className="p-5">
                {/* Preview Card */}
                <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  <div className={`h-32 bg-gradient-to-br ${form.gradient} p-4 flex flex-col justify-between`}>
                    <div className="flex items-start justify-between">
                      <div className="p-2 bg-white/20 rounded-lg">
                        <BookOpen className="w-4 h-4 text-white" />
                      </div>
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md ${
                        form.status === 'published' ? 'bg-emerald-500/30 text-white' : 'bg-white/20 text-white'
                      }`}>
                        {form.status}
                      </span>
                    </div>
                    {form.level !== 'All Levels' && (
                      <span className="text-[9px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-md w-fit">
                        {form.level}
                      </span>
                    )}
                  </div>
                  <div className="p-4 bg-white">
                    <h4 className="font-bold text-slate-900 text-sm line-clamp-1">
                      {form.name || 'Course Title'}
                    </h4>
                    <p className="text-slate-400 text-xs mt-1 line-clamp-2 leading-relaxed">
                      {form.short_description || form.description || 'Course description will appear here...'}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-400 pt-3 border-t border-slate-50">
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{form.language}</span>
                      <span className="flex items-center gap-1">
                        {form.is_free ? <span className="text-emerald-600 font-semibold">Free</span> : <span className="text-indigo-600 font-semibold">${form.price}</span>}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Meta */}
                <div className="mt-4 space-y-2">
                  {form.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {form.tags.map(tag => (
                        <span key={tag} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg font-medium ${
                    form.certificate_enabled ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-400'
                  }`}>
                    <Award className="w-3.5 h-3.5" />
                    {form.certificate_enabled ? 'Certificate included' : 'No certificate'}
                  </div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
              <h4 className="text-sm font-bold text-indigo-800 mb-3">Tips for a great course</h4>
              <ul className="space-y-2 text-xs text-indigo-700">
                {[
                  'Write a clear, specific title that describes the outcome',
                  'Use the short description to hook students in search results',
                  'Add relevant tags to improve discoverability',
                  'Choose the right level to attract the correct audience',
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 mt-0.5 text-indigo-500 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
