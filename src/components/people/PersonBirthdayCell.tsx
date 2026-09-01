import { IPerson } from '@/types/person'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { updatePerson } from '@/handlers/api/people.handler';
import { useToast } from '../ui/use-toast';
import { format } from 'date-fns';
import { CalendarDays, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

import * as chrono from 'chrono-node'

interface IProps {
  person: IPerson
}

const normalizeDateOnly = (value?: Date | string | null): Date | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export default function PersonBirthdayCell({ person }: IProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const normalizedBirthDate = useMemo(() => normalizeDateOnly(person.birthDate), [person.birthDate]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(normalizedBirthDate);
  const [textInput, setTextInput] = useState('');

  useEffect(() => {
    setSelectedDate(normalizeDateOnly(person.birthDate));
  }, [person.birthDate]);

  const handleSave = (date: Date | null) => {
    const formatted = date ? format(date, 'yyyy-MM-dd') : null;
    setLoading(true);
    updatePerson(person.id, { birthDate: formatted })
      .then(() => {
        setSelectedDate(date);
        setOpen(false);
        setTextInput('');
        toast({ title: "Birthday saved" });
      })
      .catch(() => {
        toast({ title: "Error", description: "Failed to save birthday", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  };

  const handleCalendarSelect = (date?: Date) => {
    handleSave(date ?? null);
  };

  const handleTextCommit = () => {
    if (!textInput.trim()) {
      handleSave(null);
      return;
    }
    const parsed = chrono.parseDate(textInput);
    if (parsed) {
      handleSave(parsed);
    } else {
      toast({ title: "Couldn't parse date", description: 'Try "Jan 1 1990" or "1990-01-01"', variant: "destructive" });
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleSave(null);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setTextInput(''); }}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors group/bday"
          title={selectedDate ? `Birthday: ${format(selectedDate, 'PPP')}` : "Add birthday"}
        >
          <CalendarDays size={11} className="shrink-0 opacity-60" />
          {selectedDate ? (
            <span className="flex-1 truncate">{format(selectedDate, 'PPP')}</span>
          ) : (
            <span className="italic opacity-50">Add birthday</span>
          )}
          {selectedDate && (
            <span
              role="button"
              title="Clear birthday"
              onClick={handleClear}
              className="ml-auto opacity-0 group-hover/bday:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded"
            >
              <X size={10} />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom">
        <div className="p-3 border-b">
          <p className="text-xs font-medium text-muted-foreground mb-2">Type a date or pick from calendar</p>
          <div className="flex gap-1.5">
            <Input
              className="h-7 text-xs"
              placeholder='e.g. "Jan 1 1990"'
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextCommit();
                if (e.key === 'Escape') setOpen(false);
              }}
              autoFocus
              disabled={loading}
            />
            <Button
              size="sm"
              className="h-7 text-xs px-2"
              onClick={handleTextCommit}
              disabled={loading}
            >
              Set
            </Button>
          </div>
        </div>
        <Calendar
          mode="single"
          selected={selectedDate ?? undefined}
          onSelect={handleCalendarSelect}
          defaultMonth={selectedDate ?? new Date(1990, 0, 1)}
          disabled={loading}
        />
      </PopoverContent>
    </Popover>
  );
}
