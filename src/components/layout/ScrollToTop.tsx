import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop: React.FC = () => {
    const { pathname, hash } = useLocation();

    useLayoutEffect(() => {
        const scrollToTop = () => {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        };

        if (hash) {
            const el = document.getElementById(hash.slice(1));
            if (el) {
                el.scrollIntoView({ behavior: 'instant' });
            }
        } else {
            scrollToTop();
        }

        const id1 = setTimeout(scrollToTop, 0);
        const id2 = setTimeout(scrollToTop, 50);

        return () => {
            clearTimeout(id1);
            clearTimeout(id2);
        };
    }, [pathname, hash]);

    return null;
};

export default ScrollToTop;