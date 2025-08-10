// The following file contains the respective helper data structures that we
// expect to be returned from a query for each row of data. We can do this because
// of how structured SQL databases are.

export type FileIndexRow = {
    file_path: string;     // relative path
    last_mtime: number;    // epoch millis
    file_hash?: string | null;
};

export type FolderIndexRow = {
    folder_path: string;   // relative path
    last_mtime: number;    // epoch millis
};
