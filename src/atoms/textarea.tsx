type TextareaProps = {
  handler?: (t: string) => void;
};

const Textarea = (props: TextareaProps) => {
  return (
    <textarea
      onChange={(e) => {
        props.handler?.(e.target.value);
      }}
      className="my-textarea"
      placeholder="Enter text here"
    ></textarea>
  );
};

export default Textarea;
