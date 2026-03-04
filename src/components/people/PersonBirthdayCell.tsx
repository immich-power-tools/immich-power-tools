import { IPerson } from '@/types/person'
import React, { useEffect, useMemo, useState } from 'react'
import { DatePicker } from '../ui/datepicker'
import { updatePerson } from '@/handlers/api/people.handler';
import { Input } from '../ui/input';
import { useToast } from '../ui/use-toast';
import { format } from 'date-fns';

// @ts-ignore
import chrono from 'chrono-node'



interface IProps {
  person: IPerson
}

const normalizeDateOnly = (value?: Date | string | null): Date | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Date(
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth(),
    parsedDate.getUTCDate()
  );
}

export default function PersonBirthdayCell(
  { person }: IProps
) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const normalizedBirthDate = useMemo(() => normalizeDateOnly(person.birthDate), [person.birthDate]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(normalizedBirthDate);
  const [textDate, setTextDate] = useState<string>(normalizedBirthDate ? format(normalizedBirthDate, 'PPP') : '');

  useEffect(() => {
    setSelectedDate(normalizedBirthDate);
    setTextDate(normalizedBirthDate ? format(normalizedBirthDate, 'PPP') : '');
  }, [normalizedBirthDate]);
  
  const handleEdit = (date?: Date | null) => {
    const formatedDate = date ? format(date, 'yyyy-MM-dd') : null;
    setSelectedDate(date || null);
    setTextDate(date ? format(date, 'PPP') : '');
    setLoading(true);
    return updatePerson(person.id, {
      birthDate: formatedDate,
    })
      .then(() => {
        toast({
          title: "Success",
          description: "Person updated successfully",
        })
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
  }



  return (
    <div className='flex gap-1'>
      <Input
        className=''
        value={textDate}
        placeholder='Enter a date'
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const parsedDate = chrono.parseDate(textDate || "");
            if (parsedDate) {
              handleEdit(parsedDate);
            } else {
              handleEdit(null);
            }
          }
        }}
        disabled={loading}
        onChange={(e) => setTextDate(e.target.value)}
      />
      <DatePicker date={selectedDate} onSelect={handleEdit} iconOnly/>
    </div>
  )
}
