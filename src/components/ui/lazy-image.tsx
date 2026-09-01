 
import { ImageProps } from 'next/image'
import React, { useEffect } from 'react'

interface LazyImageProps extends ImageProps {}

export default function LazyImage(
  props: LazyImageProps
) {
  const [isVisible, setIsVisible] = React.useState(false)
  const imageRef = React.useRef<HTMLImageElement>(null)

  const setupObserver = () => {
    const observer = new IntersectionObserver((entries) => {
      
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      })
    })

    if (imageRef.current)  {
      observer.observe(imageRef.current)
    }
    return observer
  }

  useEffect(() => {
    const observer = setupObserver()
    return () => {
      observer?.disconnect()
    }
  }, [])

  if (!isVisible) return (
    <div style={{ height: props.height }} ref={imageRef}  />
  )

  return <img {...props} src={props.src as string} alt={props.alt as string} />
}
