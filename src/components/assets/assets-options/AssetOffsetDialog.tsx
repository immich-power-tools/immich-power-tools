import React, { useEffect, useState } from 'react'
import { IAsset } from '@/types/asset';
import { Dialog, DialogTitle, DialogHeader, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, offsetDate } from '@/helpers/date.helper';
import Image from 'next/image';
import { updateAssets } from '@/handlers/api/asset.handler';
import { toast } from "sonner";

interface IProps {
  assets: IAsset[];
  onComplete: () => void;
}

// Comprehensive timezone options
const TIMEZONE_OPTIONS = [
  { value: 'none', label: 'No timezone change' },
  
  // GMT -12 to -9
  { value: 'Pacific/Kwajalein', label: '(GMT -12:00) Eniwetok, Kwajalein' },
  { value: 'Pacific/Midway', label: '(GMT -11:00) Midway Island, Samoa' },
  { value: 'Pacific/Honolulu', label: '(GMT -10:00) Hawaii' },
  { value: 'Pacific/Marquesas', label: '(GMT -9:30) Taiohae' },
  { value: 'America/Anchorage', label: '(GMT -9:00) Alaska' },
  
  // GMT -8 to -4
  { value: 'America/Los_Angeles', label: '(GMT -8:00) Pacific Time (US & Canada)' },
  { value: 'America/Denver', label: '(GMT -7:00) Mountain Time (US & Canada)' },
  { value: 'America/Chicago', label: '(GMT -6:00) Central Time (US & Canada), Mexico City' },
  { value: 'America/New_York', label: '(GMT -5:00) Eastern Time (US & Canada), Bogota, Lima' },
  { value: 'America/Caracas', label: '(GMT -4:30) Caracas' },
  { value: 'America/Halifax', label: '(GMT -4:00) Atlantic Time (Canada), La Paz' },
  
  // GMT -3 to 0
  { value: 'America/St_Johns', label: '(GMT -3:30) Newfoundland' },
  { value: 'America/Sao_Paulo', label: '(GMT -3:00) Brazil, Buenos Aires, Georgetown' },
  { value: 'Atlantic/South_Georgia', label: '(GMT -2:00) Mid-Atlantic' },
  { value: 'Atlantic/Azores', label: '(GMT -1:00) Azores, Cape Verde Islands' },
  { value: 'UTC', label: '(GMT) UTC' },
  { value: 'Europe/London', label: '(GMT) Western Europe Time, London, Lisbon, Casablanca' },
  
  // GMT +1 to +4
  { value: 'Europe/Paris', label: '(GMT +1:00) Brussels, Copenhagen, Madrid, Paris' },
  { value: 'Europe/Berlin', label: '(GMT +1:00) Berlin, Rome, Amsterdam' },
  { value: 'Africa/Cairo', label: '(GMT +2:00) Cairo, South Africa' },
  { value: 'Europe/Moscow', label: '(GMT +3:00) Baghdad, Riyadh, Moscow, St. Petersburg' },
  { value: 'Asia/Tehran', label: '(GMT +3:30) Tehran' },
  { value: 'Asia/Dubai', label: '(GMT +4:00) Abu Dhabi, Muscat, Baku, Tbilisi' },
  { value: 'Asia/Kabul', label: '(GMT +4:30) Kabul' },
  
  // GMT +5 to +8
  { value: 'Asia/Karachi', label: '(GMT +5:00) Ekaterinburg, Islamabad, Karachi, Tashkent' },
  { value: 'Asia/Kolkata', label: '(GMT +5:30) Bombay, Calcutta, Madras, New Delhi' },
  { value: 'Asia/Kathmandu', label: '(GMT +5:45) Kathmandu, Pokhara' },
  { value: 'Asia/Dhaka', label: '(GMT +6:00) Almaty, Dhaka, Colombo' },
  { value: 'Asia/Yangon', label: '(GMT +6:30) Yangon, Mandalay' },
  { value: 'Asia/Bangkok', label: '(GMT +7:00) Bangkok, Hanoi, Jakarta' },
  { value: 'Asia/Shanghai', label: '(GMT +8:00) Beijing, Perth, Singapore, Hong Kong' },
  { value: 'Australia/Eucla', label: '(GMT +8:45) Eucla' },
  
  // GMT +9 to +12
  { value: 'Asia/Tokyo', label: '(GMT +9:00) Tokyo, Seoul, Osaka, Sapporo, Yakutsk' },
  { value: 'Australia/Adelaide', label: '(GMT +9:30) Adelaide, Darwin' },
  { value: 'Australia/Sydney', label: '(GMT +10:00) Eastern Australia, Guam, Vladivostok' },
  { value: 'Australia/Lord_Howe', label: '(GMT +10:30) Lord Howe Island' },
  { value: 'Pacific/Noumea', label: '(GMT +11:00) Magadan, Solomon Islands, New Caledonia' },
  { value: 'Pacific/Norfolk', label: '(GMT +11:30) Norfolk Island' },
  { value: 'Pacific/Auckland', label: '(GMT +12:00) Auckland, Wellington, Fiji, Kamchatka' },
  { value: 'Pacific/Chatham', label: '(GMT +12:45) Chatham Islands' },
  
  // GMT +13 to +14
  { value: 'Pacific/Apia', label: '(GMT +13:00) Apia, Nukualofa' },
  { value: 'Pacific/Kiritimati', label: '(GMT +14:00) Line Islands, Tokelau' },
];

const offsetDateWithTimezone = (
  date: string, 
  offset: { 
    years: number, 
    days: number, 
    hours: number, 
    minutes: number, 
    seconds: number 
  },
  timezone?: string
): string => {
  // First apply the standard offset
  const offsettedDate = offsetDate(date, offset);
  
  // If no timezone specified or "none" selected, return the offset date
  if (!timezone || timezone === 'none') {
    return offsettedDate;
  }
  
  // Convert timezone
  try {
    const parsedDate = new Date(offsettedDate);
    
    // Get the current timezone offset
    const currentOffset = parsedDate.getTimezoneOffset();
    
    // Get the target timezone offset
    const targetDate = new Date(parsedDate.toLocaleString('en-US', { timeZone: timezone }));
    const utcDate = new Date(parsedDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const targetOffset = (utcDate.getTime() - targetDate.getTime()) / 60000;
    
    // Calculate the difference and apply it
    const offsetDifference = targetOffset - currentOffset;
    const finalDate = new Date(parsedDate.getTime() + (offsetDifference * 60000));
    
    return finalDate.toISOString();
  } catch (error) {
    console.warn('Timezone conversion failed, using offset date:', error);
    return offsettedDate;
  }
};

export default function AssetOffsetDialog({ assets: _assets, onComplete }: IProps) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<IAsset[]>(_assets);
  const [offsetData, setOffsetData] = useState<{ 
    days: number, 
    hours: number, 
    minutes: number, 
    seconds: number, 
    years: number,
    timezone: string 
  }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    years: 0,
    timezone: 'none'
  });
  const [loading, setLoading] = useState(false);
  const [assetStatus, setAssetStatus] = useState<Record<string, string>>({});

  const handleChange = (key: keyof typeof offsetData, value: number | string) => {
    setOffsetData({ ...offsetData, [key]: value });
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const promises = assets.map(async (asset) => {
      setAssetStatus({ [asset.id]: 'pending' });
      await updateAssets({
        ids: [asset.id],
        dateTimeOriginal: offsetDateWithTimezone(asset.dateTimeOriginal, offsetData, offsetData.timezone)
      })
        .then(() => {
          setLoading(false);
          setOpen(false);
        })
        .catch((error) => {
          setLoading(false);
          setAssetStatus({ [asset.id]: 'error' });
        })
    });
    await Promise.all(promises);
    setLoading(false);
    setOpen(false);
    onComplete();
    toast.success('Asset dates offset', { description: 'Asset dates have been offset' })
  }

  useEffect(() => {
    setAssets(_assets);
  }, [_assets]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={"default"} size={"sm"} onClick={() => setOpen(true)} disabled={assets.length === 0}>
          Offset Dates
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-[900px]'>
        <DialogHeader>
          <DialogTitle>Offset Asset Dates</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='grid grid-cols-4 gap-4 items-end'>
            <div>
              <Label>Years</Label>
              <Input type="number" value={offsetData.years} onChange={(e) => handleChange("years", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Days</Label>
              <Input type="number" value={offsetData.days} onChange={(e) => handleChange("days", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Hours</Label>
              <Input type="number" value={offsetData.hours} onChange={(e) => handleChange("hours", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Minutes</Label>
              <Input type="number" value={offsetData.minutes} onChange={(e) => handleChange("minutes", parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div className='grid grid-cols-3 gap-4 items-end'>
            <div>
              <Label>Seconds</Label>
              <Input type="number" value={offsetData.seconds} onChange={(e) => handleChange("seconds", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Convert to Timezone</Label>
              <Select value={offsetData.timezone} onValueChange={(value) => handleChange("timezone", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button disabled={loading} type="submit" className="w-full">Offset Dates</Button>
            </div>
          </div>
        </form>
        <div className='grid grid-cols-3 gap-4 py-2 overflow-y-auto max-h-[500px]'>
          {assets.map((asset) => (
            <div key={asset.id} >
              <div className='relative w-full h-full rounded-md border overflow-hidden' >
                {assetStatus[asset.id] === 'pending' ? <div className='absolute text-xs text-center bottom-0 left-0 right-0 bg-blue-500/50 text-white p-2'>
                  <p className='text-white'>Offsetting...</p>
                </div> : (
                  <div className='absolute text-xs text-center bottom-0 left-0 right-0 bg-green-500/50 text-white p-2'>
                    {formatDate(offsetDateWithTimezone(asset.dateTimeOriginal, offsetData, offsetData.timezone), 'PPpp')}
                  </div>
                )}
                <Image
                  src={asset.previewUrl}
                  alt={asset.originalFileName}
                  width={300}
                  height={300}
                  objectPosition='cover'
                  style={{
                    objectFit: 'cover',
                    overflow: 'hidden',
                    height: '100%',
                    width: '100%'
                  }}
                />
                <div className='absolute text-xs text-center top-0 left-0 right-0 bg-red-500/50 text-white p-2'>
                  {formatDate(asset.dateTimeOriginal, 'PPpp')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
