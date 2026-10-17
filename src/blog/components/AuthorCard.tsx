/** Profil penulis artikel. */
import React from 'react';
import type { BlogAuthor } from '../types';

export const AuthorCard: React.FC<{ author: BlogAuthor }> = ({ author }) => {
  const initial = (author.name.trim().charAt(0) || 'E').toUpperCase();
  return (
    <section className="ezb-author" aria-label="Tentang penulis">
      <div className="ezb-author-avatar" aria-hidden="true">
        {initial}
      </div>
      <div>
        <h3>{author.name}</h3>
        <div className="ezb-role">{author.role}</div>
        {author.bio && <p>{author.bio}</p>}
      </div>
    </section>
  );
};

export default AuthorCard;
