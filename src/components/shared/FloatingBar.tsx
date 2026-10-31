import clsx from 'clsx';
import React from 'react'

interface FloatingBarProps {  
  children: React.ReactNode;
  className?: string;
}

export default function FloatingBar({ children, className }: FloatingBarProps) {
  return (
      // left offsets mirror RootLayout's sidebar columns (md:200px / lg:240px)
      // so the bar centers over the content area, not the whole viewport.
      <div className={clsx('fixed bottom-10 left-0 md:left-[200px] lg:left-[240px] right-0 max-w-2xl mx-auto py-2 px-2 rounded-lg flex justify-between items-center bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 border shadow-lg z-50', className)}>
        {children}
      </div>
  )
}
