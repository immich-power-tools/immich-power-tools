import React, { useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { IAlbum, IAlbumPerson } from '@/types/album'
import { getAlbumPeople } from '@/handlers/api/album.handler'
import Loader from '@/components/ui/loader'
import LazyImage from '@/components/ui/lazy-image'
import { PERSON_THUBNAIL_PATH } from '@/config/routes'
import Link from 'next/link'
import { useConfig } from '@/contexts/ConfigContext'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/router'
import Image from 'next/image'
import { PersonMergeDropdown } from '@/components/people/PersonMergeDropdown'
import { Button } from '@/components/ui/button'
import { updatePerson } from '@/handlers/api/people.handler'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { CheckIcon } from '@radix-ui/react-icons'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { toast } from "sonner";

interface AlbumPeopleProps {
  album: IAlbum
  onSelect: (person: IAlbumPerson) => void
  readOnly?: boolean
}

export interface IAlbumPeopleRef {
  updatePerson: (person: IAlbumPerson) => void
  mergePerson: (oldPerson: IAlbumPerson, newPerson: IAlbumPerson) => void
}


const AlbumPeople = React.forwardRef<IAlbumPeopleRef, AlbumPeopleProps>(({ album, onSelect, readOnly }, ref) => {
  const { exImmichUrl } = useConfig()
  const router = useRouter()
  const { query, pathname } = router
  const [people, setPeople] = useState<IAlbumPerson[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hidingPerson, setHidingPerson] = useState<boolean>(false)
  const [selectionMode, setSelectionMode] = useState<boolean>(false)
  const [selectedPeople, setSelectedPeople] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState<string>("")

  const selectedPerson = useMemo(() => {
    return people.find((person) => query.faceId === person.id)
  }, [people, query.faceId])

  const filteredPeople = useMemo(() => {
    return people.filter((person) => person.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [people, searchQuery])

  const { knownPeople, unknownPeople } = useMemo(() => {
    return {
      knownPeople: filteredPeople.filter((person) => person.name),
      unknownPeople: filteredPeople.filter((person) => !person.name)
    }
  }, [filteredPeople])

  const fetchPeople = async () => {
    return getAlbumPeople(album.id).then((people) => {
      setPeople(people)
    }).catch((error) => {
      setErrorMessage(error.message)
    }).finally(() => {
      setLoading(false)
    })
  }

  const hidePerson = (personId: string) => {
    return updatePerson(personId, { isHidden: true }).then(() => {
      setPeople((oldPeople) => oldPeople.filter((person) => person.id !== personId))
      router.push({
        pathname,
        query: {
          ...query,
          faceId: null
        }
      })
    })
  }

  const handleHidePerson = (personId: string) => {
    setHidingPerson(true)
    hidePerson(personId)
      .then(() => toast.success("Person hidden"))
      .catch(() => toast.error("Failed to hide person"))
      .finally(() => setHidingPerson(false))
  }

  const handleHideSelectedPeople = () => {
    const count = selectedPeople.length
    Promise.all(selectedPeople.map(hidePerson))
      .then(() => {
        toast.success(`Hidden ${count} ${count === 1 ? "person" : "people"}`)
        setSelectedPeople([])
        setSelectionMode(false)
      })
      .catch(() => toast.error("Failed to hide some people"))
  }

  const handleBulkSelect = (personId: string) => {
    if (selectedPeople.includes(personId)) {
      setSelectedPeople(selectedPeople.filter((id) => id !== personId))
    } else {
      setSelectedPeople([...selectedPeople, personId])
    }
  }

  const handleUnknownPeopleCheck = (checked: boolean) => {
    setSelectedPeople(checked ? unknownPeople.map((person) => person.id) : [])
    router.push({
      pathname,
      query: {
        ...query,
        faceId: null
      }
    })
  }


  useEffect(() => {
    fetchPeople()
  }, [])

  useImperativeHandle(ref, () => ({
    updatePerson: (person: IAlbumPerson) => {
      setPeople((oldPeople) => oldPeople.map((p) => p.id === person.id ? person : p))
    },
    mergePerson: (oldPerson: IAlbumPerson, newPerson: IAlbumPerson) => {
      setPeople((oldPeople) => oldPeople.map((p) => p.id === oldPerson.id ? newPerson : p))
    }
  }))

  if (loading) {
    return <Loader />
  }
  if (errorMessage) {
    return <div>{errorMessage}</div>
  }



  const renderPerson = (person: IAlbumPerson) => (
    <div
      className={cn(
        'flex items-center gap-2 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-700 rounded-md p-1',
        selectedPerson?.id === person.id ? "bg-gray-300 dark:bg-gray-700" : ""
      )}
      key={person.id}
      onClick={() => {
        if (selectionMode) {
          handleBulkSelect(person.id)
        } else {
          onSelect(person)
        }
      }}
    >
      {selectionMode && (
        <Checkbox
          id={person.id + "_checkbox"}
          checked={selectedPeople.includes(person.id)}
          onCheckedChange={() => handleBulkSelect(person.id)}
        />
      )}
      <LazyImage
        role="button"
        className={
          cn("cursor-pointer h-10 w-10 min-w-10 rounded-full",
          )
        }
        src={PERSON_THUBNAIL_PATH(person.id)} alt={person.name} />
      <div className='flex flex-col'>
        <p className='text-sm'>{person.name || "No Name"}</p>
        <p className={
          cn("text-xs text-gray-500 dark:text-gray-400")
        }>{person.numberOfPhotos} photos</p>
      </div>
    </div>
  )

  return (
    <div className="overflow-y-auto min-w-[200px] sticky top-0 py-2 max-h-[calc(100vh-60px)] min-h-[calc(100vh-60px)] border-r border-gray-200 dark:border-zinc-800 flex flex-col gap-2 px-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search"
          className="flex-1"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {!readOnly && !selectedPerson && (
          <Button
            variant={selectionMode ? "default" : "outline"}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              setSelectionMode(!selectionMode)
              if (selectionMode) {
                setSelectedPeople([])
              }
            }}
          >
            <CheckIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
      {selectedPerson && (
        <div className='flex flex-col gap-2 bg-white dark:bg-zinc-900 py-2 rounded-md'>
          <div className='flex items-center gap-2'>
            <Image
              src={PERSON_THUBNAIL_PATH(selectedPerson.id)}
              alt={selectedPerson.name}
              width={20}
              height={20}
              className="rounded-full"
            />


            <Link target="_blank" href={`${exImmichUrl}/people/${selectedPerson.id}`}
              className="text-sm font-medium">
              {selectedPerson.name || "No Name"}
            </Link>
          </div>
          {!readOnly && (
            <div className='flex items-center gap-2'>
              <PersonMergeDropdown
                person={{
                  ...selectedPerson,
                  assetCount: selectedPerson.numberOfPhotos,
                  birthDate: null,
                  thumbnailPath: PERSON_THUBNAIL_PATH(selectedPerson.id),
                  isHidden: false,
                  updatedAt: new Date()
                }}
                triggerClassName='w-full flex-1'
                onComplete={(mergedPerson) => {
                  router.push({
                    pathname,
                    query: {
                      ...query,
                      faceId: mergedPerson.id
                    }
                  })
                }} />
              <Button disabled={hidingPerson} variant={"outline"} className="!py-0.5 !px-2 text-xs h-7 flex-1" onClick={() => handleHidePerson(selectedPerson.id)}>
                Hide
              </Button>
            </div>
          )}
        </div>
      )}

      <div className='flex flex-col gap-1 flex-1 overflow-y-auto'>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="known-people" className="border-none">
            <AccordionTrigger className="py-2 hover:no-underline">
              <div className="flex items-center gap-2 justify-between w-full">
                <p className="text-xs font-medium">Known ({knownPeople.length})</p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-1">
                {knownPeople.map(renderPerson)}
              </div>
            </AccordionContent>
          </AccordionItem>

          {unknownPeople.length > 0 && (
            <AccordionItem value="unknown-people" className="border-none">
              <AccordionTrigger className="py-2 hover:no-underline">
                <div className="flex items-center gap-2 justify-between w-full">
                  <p className="text-xs font-medium">Unknown ({unknownPeople.length})</p>
                  <Checkbox
                    id='unknown-people-checkbox'
                    checked={selectedPeople.length === unknownPeople.length}
                    onCheckedChange={(checked: boolean) => {
                      handleUnknownPeopleCheck(checked)
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-1">
                  {unknownPeople.map(renderPerson)}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>

        {selectedPeople.length > 0 && (
          <div className='sticky bottom-0 w-full py-2 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800'>
            <Button variant="default" className="!py-0.5 !px-2 text-xs h-7 w-full" onClick={handleHideSelectedPeople}>
              Hide {selectedPeople.length} people
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})

AlbumPeople.displayName = "AlbumPeople"

export default AlbumPeople
