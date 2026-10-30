import { useParams } from 'react-router'
import { typeOf } from '@/domain/catalog'

/** The record type named by `/modules/:id/:type`. */
export function useRecordType() {
  const { id = '', type = '', rid } = useParams()
  return { type: typeOf(`${id}.${type}`), rid: rid ? decodeURIComponent(rid) : undefined }
}
