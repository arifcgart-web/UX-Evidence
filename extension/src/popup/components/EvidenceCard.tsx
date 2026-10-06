import type { EvidenceRecord } from '../../types/evidence';
import { truncate } from '@shared/format';
import { AnnotatedImage } from './AnnotatedImage';

interface Props {
  record: EvidenceRecord;
  thumbUrl: string;
  onOpen: (id: string) => void;
  onTag: (tag: string) => void;
}

export function EvidenceCard({ record, thumbUrl, onOpen, onTag }: Props) {
  return (
    <article className="card">
      <button type="button" className="card-main" onClick={() => onOpen(record.id)}>
        <AnnotatedImage className="thumb" src={thumbUrl} alt="" shapes={record.annotations ?? []} cover />
        <div className="card-body">
          <div className="card-meta">
            <span className="site">{record.domain}</span>
            <span className="dot">·</span>
            <span className="cat">{record.category}</span>
          </div>
          <p className="obs">{truncate(record.observation, 90)}</p>
        </div>
      </button>
      {record.tags.length > 0 && (
        <div className="card-tags">
          {record.tags.slice(0, 5).map((tag) => (
            <button type="button" key={tag} className="tag" onClick={() => onTag(tag)} title={`Filter by ${tag}`}>
              {tag}
            </button>
          ))}
          {record.tags.length > 5 && <span className="tag more">+{record.tags.length - 5}</span>}
        </div>
      )}
    </article>
  );
}
