import os

def print_tree(startpath, exclude=('.git', 'node_modules', 'dist', '__pycache__', '.venv', 'build', 'venv', 'electron', 'public')):
    for root, dirs, files in os.walk(startpath):
        dirs[:] = [d for d in dirs if d not in exclude]
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * level
        print('{}{}/'.format(indent, os.path.basename(root) if root != startpath else 'nemhemai'))
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            if not f.endswith('.pyc') and not f.endswith('.log') and f != 'tree.py':
                print('{}{}'.format(subindent, f))

if __name__ == '__main__':
    print_tree('.')
