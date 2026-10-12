import PageLayout from '@/components/layouts/PageLayout';
import PersonAlbumList from '@/components/people/info/PersonAlbumList';
import PersonCityList from '@/components/people/info/PersonCityList';
import PersonFaceGrid from '@/components/people/info/PersonFaceGrid';
import Header from '@/components/shared/Header';
import Loader from '@/components/ui/loader';
import { PERSON_THUBNAIL_PATH } from '@/config/routes';
import { getPersonInfo } from '@/handlers/api/person.handler';
import { IPerson } from '@/types/person'
import { GalleryThumbnails, MapPin, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react'

interface IPersonFullInfo extends IPerson {
  albums: {
    id: string;
    name: string;
    assetCount: number;
    thumbnail: string;
    lastAssetYear: number;
  }[];
  citiesCount: number;
  countriesCount: number;
  cities: {
    city: string;
    country: string;
    count: number;
  }[];
}

export default function PersonPage() {
  const router = useRouter();
  const { pathname, query } = router;
  const { personId } = router.query as { personId: string };
  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState<IPersonFullInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);


  const fetchPersonInfo = async (personId: string) => {
    setLoading(true);
    getPersonInfo(personId).then(setPerson).catch((err) => {
      setErrorMessage(err.message);

    }).finally(() => {
      setLoading(false);
    });
  }

  useEffect(() => {
    fetchPersonInfo(personId);
  }, [personId]);

  const renderContent = () => {
    if (query.tab === "cities") {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center gap-2">
            <span className="text-lg font-medium">Cities</span>
            <span className="text-sm text-gray-500">{person?.citiesCount} Cities, {person?.countriesCount} Countries</span>
          </div>
            <PersonCityList cities={person?.cities || []} personId={personId} />
        </div>
      )
    }

    if (query.tab === "faces") {
      return (
        <PersonFaceGrid personId={personId} personName={person?.name || ""} />
      )
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center gap-2">
          <span className="text-lg font-medium">Albums</span>
          <span className="text-sm text-gray-500">{person?.albums.length} Albums</span>
        </div>

        <PersonAlbumList albums={person?.albums || []} personId={personId} />
      </div>
    )
  }

  if (loading) return <Loader />
  if (errorMessage) return <div>{errorMessage}</div>;
  if (!person) return <div>Person not found</div>;


  return (
    <PageLayout className="!p-0 !mb-0" title={person?.name}>
      <Header
        title={person?.name}
        leftComponent={
          <div className="flex items-center gap-2">
            <Image src={PERSON_THUBNAIL_PATH(person?.id)}
              alt={person?.name} width={32} height={32} className="rounded-full" />
            <span className="font-medium">{person?.name}</span>
          </div>
        }
      />
      <div className="flex divide-y">
        <div className="overflow-y-auto sticky top-0 min-w-[200px] py-2 max-h-[calc(100vh-60px)] min-h-[calc(100vh-60px)]  dark:bg-zinc-900 bg-gray-200 flex flex-col gap-2 px-2">
          <ul className="flex flex-col gap-1">
            <li>
              <Link href={{
                pathname: pathname,
                query: {
                  ...query,
                  tab: "albums"
                }
              }} className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-gray-300 dark:hover:bg-zinc-800">
                <GalleryThumbnails size={14} />
                <span className="text-sm font-medium">Albums</span>
              </Link>
            </li>
            <li>
              <Link href={{
                pathname: pathname,
                query: {
                  ...query,
                  tab: "cities"
                }
              }} className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-gray-300 dark:hover:bg-zinc-800">
                <MapPin size={14} />
                <span className="text-sm font-medium">Cities</span>
              </Link>
            </li>
            <li>
              <Link href={{
                pathname: pathname,
                query: {
                  ...query,
                  tab: "faces"
                }
              }} className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-gray-300 dark:hover:bg-zinc-800">
                <Users size={14} />
                <span className="text-sm font-medium">Faces</span>
              </Link>
            </li>
          </ul>
        </div>
        <div className="p-4  flex-1">
          {renderContent()}
        </div>
      </div>
    </PageLayout>
  )
}
