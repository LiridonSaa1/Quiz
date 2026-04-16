import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { Edit2, Trash2 } from 'lucide-react';

export interface AdminCardMeta {
  icon: React.ElementType;
  iconClass?: string;
  iconBg?: string; // used for custom bg like initials
  iconContent?: React.ReactNode; // custom content inside the icon box
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  fullWidth?: boolean;
}

export interface AdminCardProps {
  id: string;
  index?: number;
  key?: React.Key;
  icon: React.ElementType;
  iconClass?: string;
  iconBgClass?: string;
  topRightBlurClass?: string;
  
  badges?: React.ReactNode;
  
  title: string;
  description?: string;
  
  meta: AdminCardMeta[];
  
  onEdit?: () => void;
  onDelete?: () => void;
  customActions?: React.ReactNode;
}

export function AdminCard({
  index = 0,
  icon: Icon,
  iconClass = "text-white",
  iconBgClass = "bg-gradient-to-br from-indigo-500 to-violet-600",
  topRightBlurClass = "bg-indigo-50",
  badges,
  title,
  description,
  meta,
  onEdit,
  onDelete,
  customActions
}: AdminCardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-xl transition-all duration-300 group flex flex-col relative overflow-hidden"
    >
      <div className={cn("absolute top-0 right-0 w-32 h-32 opacity-50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none", topRightBlurClass)} />
      
      <div className="flex items-start justify-between mb-5 relative z-10">
        <div className="flex items-center gap-3 pr-2">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md", iconBgClass)}>
            <Icon className={cn("w-6 h-6", iconClass)} />
          </div>
          <div>
            {badges && (
              <div className="flex flex-col gap-1.5">
                {badges}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
          {customActions}
          {onEdit && (
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onEdit}
              className="p-2 rounded-xl text-indigo-600 hover:bg-indigo-100 transition-colors bg-white shadow-sm border border-slate-100" title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </motion.button>
          )}
          {onDelete && (
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onDelete}
              className="p-2 rounded-xl text-rose-600 hover:bg-rose-100 transition-colors bg-white shadow-sm border border-slate-100" title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </motion.button>
          )}
        </div>
      </div>

      <div className="mb-5 flex-1 relative z-10">
        <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors mb-2 line-clamp-2">
          {title}
        </h3>
        <p className="text-sm font-medium text-slate-500 line-clamp-2">
          {description || 'No description provided.'}
        </p>
      </div>

      {meta && meta.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-5 border-t border-slate-100 relative z-10 mt-auto">
          {meta.map((m, i) => (
            <div key={i} className={cn("flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100/50", m.fullWidth && "sm:col-span-2")}>
              <div className={cn("w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-100 flex items-center justify-center shrink-0", m.iconBg)}>
                {m.iconContent ? m.iconContent : <m.icon className={cn("w-4 h-4", m.iconClass || "text-slate-500")} />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{m.label}</p>
                <div className={cn("font-bold text-slate-700 truncate text-xs", m.valueClass)}>{m.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function AdminCardSkeleton() {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm animate-pulse h-[280px] flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-slate-200 rounded-2xl shrink-0" />
          <div className="space-y-2">
            <div className="w-20 h-5 bg-slate-200 rounded-md" />
            <div className="w-16 h-4 bg-slate-200 rounded-md" />
          </div>
        </div>
      </div>
      <div className="w-3/4 h-6 bg-slate-200 rounded-md mb-2" />
      <div className="w-full h-4 bg-slate-200 rounded-md mb-6" />
      
      <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 gap-3 pt-5 border-t border-slate-100">
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <div className="w-8 h-8 bg-slate-200 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5"><div className="w-1/2 h-2.5 bg-slate-200 rounded" /><div className="w-3/4 h-3.5 bg-slate-200 rounded" /></div>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <div className="w-8 h-8 bg-slate-200 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5"><div className="w-1/2 h-2.5 bg-slate-200 rounded" /><div className="w-3/4 h-3.5 bg-slate-200 rounded" /></div>
        </div>
      </div>
    </div>
  );
}