import { Button, Flex, Tooltip } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

type Item = { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string; path: string };

interface SidebarButtonGroupInterface {
    items: Item[];
    hovered: string | null;
    setHovered: (path: string | null) => void;
    currentPath: string;
}

export function SidebarButtonGroup({ items, hovered, setHovered, currentPath }: SidebarButtonGroupInterface) {
    // index that is currently tabbable
    const activeIndexFromRoute = useMemo(() => {
        const idx = items.findIndex(({ path }) =>
            path === '/'
                ? currentPath === '/'
                : currentPath === path || currentPath.startsWith(path + '/')
        );
        return idx >= 0 ? idx : 0;
    }, [items, currentPath]);

    const [focusIndex, setFocusIndex] = useState<number>(activeIndexFromRoute);

    // keep roving focus in sync with route changes
    useEffect(() => setFocusIndex(activeIndexFromRoute), [activeIndexFromRoute]);

    // refs to focus the underlying buttons/anchors
    const refs = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([]);
    refs.current = items.map((_, i) => refs.current[i] ?? null);

    const moveFocus = (next: number) => {
        const clamped = Math.max(0, Math.min(items.length - 1, next));
        setFocusIndex(clamped);
        const el = refs.current[clamped];
        if (el) el.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // ignore when modifier keys held
        if (e.altKey || e.ctrlKey || e.metaKey) return;

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                moveFocus(focusIndex - 1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                moveFocus(focusIndex + 1);
                break;
            case 'Home':
                e.preventDefault();
                moveFocus(0);
                break;
            case 'End':
                e.preventDefault();
                moveFocus(items.length - 1);
                break;
            default:
                break;
        }
    };

    return (
        <Flex
            direction="column"
            align="center"
            gap="md"
            role="toolbar"
            aria-label="Sidebar navigation"
            aria-orientation="vertical"
            onKeyDown={onKeyDown}
        >
            {items.map(({ icon: Icon, label, path }, i) => {
                const isHovered = hovered === path;
                const isActive =
                    path === '/'
                        ? currentPath === '/'
                        : currentPath === path || currentPath.startsWith(path + '/');

                return (
                    <Tooltip key={path} label={label} position="right">
                        <Button
                            component={Link}
                            to={path}
                            aria-label={label}
                            // announce current page to ATs when applicable
                            aria-current={isActive ? 'page' : undefined}
                            // roving tabindex: only one is 0, others -1
                            tabIndex={i === focusIndex ? 0 : -1}
                            // update roving index if the user clicks or tabs into an item
                            onFocus={() => setFocusIndex(i)}
                            ref={(el) => { refs.current[i] = el; }}
                            variant={isActive ? 'filled' : 'outline'}
                            onMouseEnter={() => setHovered(path)}
                            onMouseLeave={() => setHovered(null)}
                            style={{
                                width: 40,
                                height: 40,
                                padding: 0,
                                transform: isHovered ? 'scale(1.075)' : 'scale(1)',
                                transition: 'transform 150ms ease',
                            }}
                        >
                            <Icon size={20} strokeWidth={2} />
                        </Button>
                    </Tooltip>
                );
            })}
        </Flex>
    );
}
