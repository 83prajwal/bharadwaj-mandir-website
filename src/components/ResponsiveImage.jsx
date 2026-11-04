import { getImageSources } from '../lib/responsiveImage'

// <img> with WebP srcset, lazy loading and intrinsic size from the manifest.
export default function ResponsiveImage({ src, alt, sizes = '100vw', width, height, priority = false, className, ...rest }) {
  const image = getImageSources(src)
  return (
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={image.srcSet ? sizes : undefined}
      alt={alt}
      width={width || image.width}
      height={height || image.height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={className}
      {...rest}
    />
  )
}
